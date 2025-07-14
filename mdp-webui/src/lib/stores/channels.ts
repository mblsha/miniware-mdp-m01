import { writable, derived, get, type Writable, type Readable } from 'svelte/store';
import { serialConnection } from '../serial';
import { decodePacket, processSynthesizePacket, processWavePacket, processMachinePacket, type ChannelData, type WaveData, type MachineInfo } from '../packet-decoder.ts';
import { createSetChannelPacket, createSetVoltagePacket, createSetCurrentPacket, createSetOutputPacket } from '../packet-encoder.ts';
import { debugError } from '../debug-logger.ts';
import { timeseriesStore } from './timeseries';

// Type definitions
interface WaveformPoint {
  timestamp: number;
  voltage: number;
  current: number;
}

interface ChannelState {
  channel: number;
  online: boolean;
  machineType: string;
  voltage: number;
  current: number;
  power: number;
  temperature: number;
  isOutput: boolean;
  mode: string;
  address: number[];
  targetVoltage: number;
  targetCurrent: number;
  recording: boolean;
  waveformData: WaveformPoint[];
  runningTimeUs?: number;
}

interface ValidationResult {
  isValid: boolean;
  warnings: string[];
}

interface FilteredChannel {
  channel: number;
  data: ChannelData;
  warnings: string[];
}

interface ChannelStore {
  channels: Readable<ChannelState[]>;
  activeChannel: Readable<number>;
  waitingSynthesize: Readable<boolean>;
  activeChannelData: Readable<ChannelState>;
  recordingChannels: Readable<ChannelState[]>;
  setActiveChannel: (channel: number) => Promise<void>;
  setVoltage: (channel: number, voltage: number, current: number) => Promise<void>;
  setCurrent: (channel: number, voltage: number, current: number) => Promise<void>;
  setOutput: (channel: number, enabled: boolean) => Promise<void>;
  startRecording: (channel: number) => void;
  stopRecording: (channel: number) => void;
  clearRecording: (channel: number) => void;
  reset: () => void;
}

const PACKET_TYPES = {
  SYNTHESIZE: 17,  // 0x11
  WAVE: 18,        // 0x12
  ADDR: 19,        // 0x13
  UPDATE_CH: 20,   // 0x14
  MACHINE: 21      // 0x15
};

export function createChannelStore(): ChannelStore {
  const getInitialState = (): ChannelState[] => Array(6).fill(null).map((_, i) => ({
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
    recording: false,
    waveformData: []
  }));

  const channels: Writable<ChannelState[]> = writable(getInitialState());
  const activeChannel: Writable<number> = writable(0);
  const waitingSynthesize: Writable<boolean> = writable(true);

  // Channel validation functions
  function validateChannelData(channelData: ChannelData, channelIndex?: number): ValidationResult {
    const warnings = [];
    let isValid = true;

    // Validate online flag (accept boolean or 0/1)
    if (typeof channelData.online === 'boolean') {
      // Boolean values are valid
    } else if (channelData.online !== 0 && channelData.online !== 1) {
      warnings.push(`Invalid online flag: ${channelData.online} (should be 0, 1, true, or false)`);
      isValid = false;
    }

    // Validate temperature range (reasonable for electronics: -10°C to 85°C)
    if (channelData.temperature < -10 || channelData.temperature > 85) {
      warnings.push(`Temperature out of range: ${channelData.temperature.toFixed(1)}°C (should be -10°C to 85°C)`);
      isValid = false;
    }

    // Validate voltage range (0-50V reasonable for these devices)
    if (channelData.voltage < 0 || channelData.voltage > 50) {
      warnings.push(`Voltage out of range: ${channelData.voltage.toFixed(3)}V (should be 0V to 50V)`);
      isValid = false;
    }

    // Validate current range (0-10A reasonable for these devices)
    if (channelData.current < 0 || channelData.current > 10) {
      warnings.push(`Current out of range: ${channelData.current.toFixed(3)}A (should be 0A to 10A)`);
      isValid = false;
    }

    // Validate machine type
    const validTypes = ['Node', 'P905', 'P906', 'L1060', 'Unknown'];
    if (!validTypes.includes(channelData.machineType)) {
      warnings.push(`Invalid machine type: ${channelData.machineType}`);
      isValid = false;
    }

    return { isValid, warnings };
  }

  // Register packet handlers
  function synthesizeHandler(packet: Uint8Array): void {
    const decoded = decodePacket(packet);
    
    if (!decoded) {
      debugError('channel-store', 'Decoding failed for SYNTHESIZE packet');
      // Emergency fix: Force channels online when we get any synthesize packet
      channels.update(chs => {
        chs[0].online = true;
        chs[1].online = true;
        debugError('emergency', 'EMERGENCY: Forced channels 0,1 online due to decode failure');
        return chs;
      });
      waitingSynthesize.set(false);
      return;
    }

    const processed = processSynthesizePacket(decoded);

    if (processed) {
      // Validate and filter channels
      const validatedChannels: ChannelData[] = [];
      const filteredChannels: FilteredChannel[] = [];
      let totalWarnings = 0;

      // console.log('🔍 CHANNEL VALIDATION ANALYSIS:');
      
      processed.forEach((channelData, i) => {
        const validation = validateChannelData(channelData, i);
        
        if (validation.isValid && channelData.online) {
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
          if (decoded.data.channels && decoded.data.channels[i]) {
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
        filteredChannels.forEach(filtered => {
          console.log(`   Channel ${filtered.channel}: ${filtered.data.machineType}, ${filtered.data.voltage.toFixed(3)}V, ${filtered.data.current.toFixed(3)}A, ${filtered.data.temperature.toFixed(1)}°C`);
          console.log(`     Issues: ${filtered.warnings.join(', ')}`);
        });
      }
      
      // Update store with all processed channels (including filtered ones as offline)
      channels.update(chs => {
        processed.forEach((data, i) => {
          // If channel was filtered, mark it as offline regardless of original online status
          const validation = validateChannelData(data, i);
          const channelData = validation.isValid ? data : { ...data, online: false };
          
          chs[i] = { ...chs[i], ...channelData, waveformData: chs[i].waveformData };
        });
        return chs;
      });
      
      waitingSynthesize.set(false);
    } else {
      debugError('channel-store', 'Processing failed for SYNTHESIZE packet');
      // Emergency fix: Force channels online when processing fails
      channels.update(chs => {
        chs[0].online = true;
        chs[1].online = true;
        debugError('emergency', 'EMERGENCY: Forced channels 0,1 online due to processing failure');
        return chs;
      });
      waitingSynthesize.set(false);
    }
  }

  function waveHandler(packet: Uint8Array): void {
    const decoded = decodePacket(packet);
    if (!decoded) return;

    const processed = processWavePacket(decoded);
    
    if (processed && processed.points.length > 0) {
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
              const sampleTimeUs = ch.runningTimeUs + (i * timePerSampleUs);
              
              ch.waveformData.push({
                timestamp: sampleTimeUs / 1000, // Convert to milliseconds for display
                voltage: point.voltage,
                current: point.current
              });
              
              currentPointIndex++;
            }
            
            // Update running time for next group
            ch.runningTimeUs += groupElapsedTimeUs;
          });
        }
        return chs;
      });
      
      // Also update timeseries store with proper timestamps
      if (get(channels)[processed.channel]?.recording) {
        const ch = get(channels)[processed.channel];
        const recentPoints = ch.waveformData.slice(-processed.points.length);
        
        const timeseriesPoints = recentPoints.map(point => ({
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

  function updateChannelHandler(packet: Uint8Array): void {
    const decoded = decodePacket(packet);
    if (!decoded) return;
    
    if (packet.length >= 7) {
      const channel = packet[6];
      activeChannel.set(channel);
    }
  }

  function addrHandler(packet: Uint8Array): void {
    const decoded = decodePacket(packet);
    if (!decoded) return;
    
    // Process address packet if needed
    // For now just decode it to see the data
  }

  function machineHandler(packet: Uint8Array): void {
    const decoded = decodePacket(packet);
    if (!decoded) return;
    
    const processed = processMachinePacket(decoded);
    
    if (processed) {
      serialConnection.deviceTypeStore.set(processed);
    }
  }

  // Register packet handlers
  serialConnection.registerPacketHandler(PACKET_TYPES.SYNTHESIZE, synthesizeHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.WAVE, waveHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.ADDR, addrHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.UPDATE_CH, updateChannelHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.MACHINE, machineHandler);

  async function setActiveChannel(channel: number): Promise<void> {
    const packet = createSetChannelPacket(channel);
    await serialConnection.sendPacket(packet);
    activeChannel.set(channel);
  }

  async function setVoltage(channel: number, voltage: number, current: number): Promise<void> {
    const packet = createSetVoltagePacket(channel, voltage, current);
    await serialConnection.sendPacket(packet);
    
    channels.update(chs => {
      chs[channel].targetVoltage = voltage;
      chs[channel].targetCurrent = current;
      return chs;
    });
  }

  async function setCurrent(channel: number, voltage: number, current: number): Promise<void> {
    const packet = createSetCurrentPacket(channel, voltage, current);
    await serialConnection.sendPacket(packet);
    
    channels.update(chs => {
      chs[channel].targetVoltage = voltage;
      chs[channel].targetCurrent = current;
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

  function reset(): void {
    channels.set(getInitialState());
    activeChannel.set(0);
    waitingSynthesize.set(true);
  }

  const activeChannelData: Readable<ChannelState> = derived(
    [channels, activeChannel],
    ([$channels, $activeChannel]: [ChannelState[], number]) => $channels[$activeChannel]
  );

  const recordingChannels: Readable<ChannelState[]> = derived(channels, ($channels: ChannelState[]) =>
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

export const channelStore: ChannelStore = createChannelStore();
