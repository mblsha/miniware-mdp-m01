import { writable, derived, get } from 'svelte/store';
import type { Channel, WaveformPoint } from '../types';
import { serialConnection } from '../serial';
import { decodePacket, isSynthesizePacket, isWavePacket, processSynthesizePacket, processWavePacket, processMachinePacket } from '../packet-decoder';
import type { ChannelUpdate } from '../packet-decoder';
import { createSetChannelPacket, createSetVoltagePacket, createSetCurrentPacket, createSetOutputPacket } from '../packet-encoder';
import { debugError } from '../debug-logger';
import { timeseriesStore } from './timeseries';

const PACKET_TYPES = {
  SYNTHESIZE: 17,  // 0x11
  WAVE: 18,        // 0x12
  ADDR: 19,        // 0x13
  UPDATE_CH: 20,   // 0x14
  MACHINE: 21      // 0x15
};

export function createChannelStore() {
  type TimeSeriesPoint = Parameters<typeof timeseriesStore.addDataPoints>[0][number];
  type FilteredChannel = { channel: number; data: ChannelUpdate; warnings: string[] };

  const getInitialState = (): Channel[] => Array(6).fill(null).map((_, i) => ({
    channel: i,
    online: false,
    machineType: 'Unknown',
    voltage: 0,
    current: 0,
    power: 0,
    temperature: 0,
    isOutput: false,
    mode: 'Normal',
    address: [0, 0, 0, 0, 0],
    targetVoltage: 0,
    targetCurrent: 0,
    targetPower: 0,
    recording: false,
    waveformData: []
  }));

  const channels = writable(getInitialState());
  const activeChannel = writable(0);
  const waitingSynthesize = writable(true);

  function markChannelsOffline(): void {
    channels.update(chs =>
      chs.map(channel => ({
        ...channel,
        online: false,
        power: 0,
        current: 0,
        voltage: 0
      }))
    );
  }

  // Channel validation functions
  function validateChannelData(channelData: ChannelUpdate): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    let isValid = true;

    // Validate online flag (accept boolean or 0/1)
    if (typeof channelData.online === 'boolean') {
      // Boolean values are valid
    } else if (channelData.online !== 0 && channelData.online !== 1) {
      warnings.push(`Invalid online flag: ${channelData.online} (should be 0, 1, true, or false)`);
      isValid = false;
    }

    // Validate temperature range (reasonable for electronics: -10°C to 85°C)
    const temperature = typeof channelData.temperature === 'number' ? channelData.temperature : Number.NaN;
    if (!Number.isFinite(temperature) || temperature < -10 || temperature > 85) {
      warnings.push(`Temperature out of range: ${Number.isFinite(temperature) ? temperature.toFixed(1) : 'NaN'}°C (should be -10°C to 85°C)`);
      isValid = false;
    }

    // Validate voltage range (0-50V reasonable for these devices)
    const voltage = typeof channelData.voltage === 'number' ? channelData.voltage : Number.NaN;
    if (!Number.isFinite(voltage) || voltage < 0 || voltage > 50) {
      warnings.push(`Voltage out of range: ${Number.isFinite(voltage) ? voltage.toFixed(3) : 'NaN'}V (should be 0V to 50V)`);
      isValid = false;
    }

    // Validate current range (0-10A reasonable for these devices)
    const current = typeof channelData.current === 'number' ? channelData.current : Number.NaN;
    if (!Number.isFinite(current) || current < 0 || current > 10) {
      warnings.push(`Current out of range: ${Number.isFinite(current) ? current.toFixed(3) : 'NaN'}A (should be 0A to 10A)`);
      isValid = false;
    }

    // Validate machine type
    const validTypes = ['Node', 'P905', 'P906', 'L1060', 'Unknown'];
    if (typeof channelData.machineType !== 'string' || !validTypes.includes(channelData.machineType)) {
      warnings.push(`Invalid machine type: ${String(channelData.machineType)}`);
      isValid = false;
    }

    return { isValid, warnings };
  }

  // Register packet handlers
  function synthesizeHandler(packet: number[]): void {
    const decoded = decodePacket(packet);
    
    if (!decoded) {
      debugError('channel-store', 'Decoding failed for SYNTHESIZE packet');
      markChannelsOffline();
      waitingSynthesize.set(false);
      return;
    }

	    const processed = processSynthesizePacket(decoded);

	    if (processed) {
	      // Validate and filter channels
	      const validatedChannels: ChannelUpdate[] = [];
	      const filteredChannels: FilteredChannel[] = [];
	      let totalWarnings = 0;

      // console.log('🔍 CHANNEL VALIDATION ANALYSIS:');
      
	      processed.forEach((channelData, i: number) => {
	        const validation = validateChannelData(channelData);
	        
	        if (validation.isValid && Boolean(channelData.online)) {
	          validatedChannels.push(channelData);
	          // console.log(`✅ Channel ${i}: VALID and ONLINE`);
	        } else if (!validation.isValid) {
	          filteredChannels.push({ channel: i, data: channelData, warnings: validation.warnings });
	          totalWarnings += validation.warnings.length;
          
          console.log(`❌ Channel ${i}: FILTERED (${validation.warnings.length} issues)`);
          validation.warnings.forEach(warning => {
            console.log(`   ⚠️  ${warning}`);
	          });
	          
	          // Show the problematic raw data for this channel
	          if (isSynthesizePacket(decoded) && decoded.data.channels[i]) {
	            const rawCh = decoded.data.channels[i];
	            console.log(`   📊 Raw channel data:`, {
	              num: rawCh.num,
	              online: rawCh.online,
	              type: rawCh.type,
              outVoltageRaw: rawCh.outVoltageRaw,
              outCurrentRaw: rawCh.outCurrentRaw,
              tempRaw: rawCh.tempRaw,
              temperature: rawCh.temperature,
              outputOn: rawCh.outputOn
            });
          }
        } else {
          // console.log(`ℹ️  Channel ${i}: VALID but OFFLINE`);
        }
      });

      const validOnlineCount = validatedChannels.length;
      
      // Only show debug output if there are filtered channels
	      if (filteredChannels.length > 0) {
        console.log(`\n📊 VALIDATION SUMMARY:`);
        console.log(`   Valid online channels: ${validOnlineCount}`);
        console.log(`   Filtered channels: ${filteredChannels.length}`);
        console.log(`   Total warnings: ${totalWarnings}`);
        
	        console.log(`\n🚨 FILTERED CHANNEL BREAKDOWN:`);
	        filteredChannels.forEach((filtered) => {
	          const voltage = typeof filtered.data.voltage === 'number' ? filtered.data.voltage.toFixed(3) : 'NaN';
	          const current = typeof filtered.data.current === 'number' ? filtered.data.current.toFixed(3) : 'NaN';
	          const temperature = typeof filtered.data.temperature === 'number' ? filtered.data.temperature.toFixed(1) : 'NaN';
	          console.log(`   Channel ${filtered.channel}: ${filtered.data.machineType}, ${voltage}V, ${current}A, ${temperature}°C`);
	          console.log(`     Issues: ${filtered.warnings.join(', ')}`);
	        });
	      }
	      
	      // Update store with all processed channels (including filtered ones as offline)
	      channels.update(chs => {
	        processed.forEach((data, i: number) => {
	          // If channel was filtered, mark it as offline regardless of original online status
	          const validation = validateChannelData(data);
	          const channelData = validation.isValid ? data : { ...data, online: false };
          
          chs[i] = { ...chs[i], ...channelData, waveformData: chs[i].waveformData };
        });
        return chs;
      });
      
      waitingSynthesize.set(false);
    } else {
      debugError('channel-store', 'Processing failed for SYNTHESIZE packet');
      markChannelsOffline();
      waitingSynthesize.set(false);
    }
  }

  function waveHandler(packet: number[]): void {
    const decoded = decodePacket(packet);
    if (!decoded) return;

	    const processed = processWavePacket(decoded);
	    
	    if (processed && processed.points.length > 0 && isWavePacket(decoded)) {
	      channels.update(chs => {
	        const ch = chs[processed.channel];
	        if (ch && ch.recording) {
          // Initialize running time if this is the first data for this channel
          if (!ch.runningTimeUs) {
            ch.runningTimeUs = 0;
          }
          
          // Determine group size from packet length
          // 126 bytes = 2 samples per group, 206 bytes = 4 samples per group
          const packetLength = packet.length;
          const samplesPerGroup = packetLength === 126 ? 2 : 4;
          
	          // Process each group's worth of points
	          let currentPointIndex = 0;
	          const wave = decoded.data;
	          
	          wave.groups.forEach((group) => {
	            // Convert timestamp from 0.1µs (100ns) ticks to microseconds
	            const groupElapsedTimeUs = group.timestamp / 10;
            
            // Time per sample in this group
            const timePerSampleUs = groupElapsedTimeUs / samplesPerGroup;
            
            // Process each sample in this group
            for (let i = 0; i < samplesPerGroup && currentPointIndex < processed.points.length; i++) {
              const point = processed.points[currentPointIndex];
              
              // Calculate absolute time for this sample
              const sampleTimeUs = (ch.runningTimeUs || 0) + (i * timePerSampleUs);
              
              if (ch.waveformData) {
                ch.waveformData.push({
                  timestamp: sampleTimeUs / 1000, // Convert to milliseconds for display
                  voltage: point.voltage,
                  current: point.current
                });
              }
              
              currentPointIndex++;
            }
            
            // Update running time for next group
            ch.runningTimeUs = (ch.runningTimeUs || 0) + groupElapsedTimeUs;
          });
        }
        return chs;
      });
      
	      // Also update timeseries store with proper timestamps
	      if (get(channels)[processed.channel]?.recording) {
	        const ch = get(channels)[processed.channel];
	        const recentPoints: WaveformPoint[] = ch.waveformData ? ch.waveformData.slice(-processed.points.length) : [];
	        
	        const timeseriesPoints: TimeSeriesPoint[] = recentPoints.map((point) => ({
	          channel: processed.channel,
	          timestamp: point.timestamp,
	          data: {
	            voltage: point.voltage,
            current: point.current
          }
        }));
        
        timeseriesStore.addDataPoints(timeseriesPoints);
      }
    }
  }

  function updateChannelHandler(packet: number[]): void {
    const decoded = decodePacket(packet);
    if (!decoded) return;
    
    if (packet.length >= 7) {
      const channel = packet[6];
      activeChannel.set(channel);
    }
  }

  function addrHandler(packet: number[]): void {
    const decoded = decodePacket(packet);
    if (!decoded) return;
    
    // Process address packet if needed
    // For now just decode it to see the data
  }

  function machineHandler(packet: number[]): void {
    const decoded = decodePacket(packet);
    if (!decoded) return;
    
    const processed = processMachinePacket(decoded);
    
    if (processed) {
      serialConnection.setDeviceType(processed);
    }
  }

  // Register packet handlers
  serialConnection.registerPacketHandler(PACKET_TYPES.SYNTHESIZE, synthesizeHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.WAVE, waveHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.ADDR, addrHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.UPDATE_CH, updateChannelHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.MACHINE, machineHandler);

  function updateTargetValues(chs: Channel[], channel: number, voltage: number, current: number): void {
    chs[channel].targetVoltage = voltage;
    chs[channel].targetCurrent = current;
    chs[channel].targetPower = voltage * current;
  }

  async function setActiveChannel(channel: number): Promise<void> {
    const packet = createSetChannelPacket(channel);
    await serialConnection.sendPacket(packet);
    activeChannel.set(channel);
  }

  async function setVoltage(channel: number, voltage: number, current: number): Promise<void> {
    const packet = createSetVoltagePacket(channel, voltage, current);
    await serialConnection.sendPacket(packet);

    channels.update(chs => {
      updateTargetValues(chs, channel, voltage, current);
      return chs;
    });
  }

  async function setCurrent(channel: number, voltage: number, current: number): Promise<void> {
    const packet = createSetCurrentPacket(channel, voltage, current);
    await serialConnection.sendPacket(packet);

    channels.update(chs => {
      updateTargetValues(chs, channel, voltage, current);
      return chs;
    });
  }

  async function setOutput(channel: number, enabled: boolean): Promise<void> {
    const packet = createSetOutputPacket(channel, enabled);
    await serialConnection.sendPacket(packet);
  }

  function startRecording(channel: number): void {
    channels.update(chs => {
      chs[channel].recording = true;
      chs[channel].waveformData = [];
      chs[channel].runningTimeUs = 0; // Reset the running time counter
      return chs;
    });
  }

  function stopRecording(channel: number): void {
    channels.update(chs => {
      chs[channel].recording = false;
      return chs;
    });
  }

  function clearRecording(channel: number): void {
    channels.update(chs => {
      chs[channel].waveformData = [];
      return chs;
    });
  }

  function reset() {
    channels.set(getInitialState());
    activeChannel.set(0);
    waitingSynthesize.set(true);
  }

  const activeChannelData = derived(
    [channels, activeChannel],
    ([$channels, $activeChannel]) => $channels[$activeChannel]
  );

  const recordingChannels = derived(channels, ($channels) =>
    $channels.filter((ch) => ch.recording)
  );

  return {
    channels,
    activeChannel: derived(activeChannel, $active => $active),
    waitingSynthesize: derived(waitingSynthesize, $waiting => $waiting),
    activeChannelData,
    recordingChannels,
    setActiveChannel,
    setVoltage,
    setCurrent,
    setOutput,
    startRecording,
    stopRecording,
    clearRecording,
    reset
  };
}

export const channelStore = createChannelStore();
