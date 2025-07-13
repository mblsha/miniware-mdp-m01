import { writable, derived } from 'svelte/store';
import { serialConnection } from '../serial';
import { decodePacket, processSynthesizePacket, processWavePacket, processMachinePacket } from '../packet-decoder';
import { createSetChannelPacket, createSetVoltagePacket, createSetCurrentPacket, createSetOutputPacket } from '../packet-encoder';
import { debugLog, debugError, debugWarn } from '../debug-logger';

const PACKET_TYPES = {
  SYNTHESIZE: 17,  // 0x11
  WAVE: 18,        // 0x12
  ADDR: 19,        // 0x13
  UPDATE_CH: 20,   // 0x14
  MACHINE: 21      // 0x15
};

export function createChannelStore() {
  const getInitialState = () => Array(6).fill(null).map((_, i) => ({
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

  const channels = writable(getInitialState());
  const activeChannel = writable(0);
  const waitingSynthesize = writable(true);

  // Register packet handlers
  function synthesizeHandler(packet) {
    debugLog('channel-store', 'SYNTHESIZE HANDLER START - PACKET TYPE:', packet[2]);
    debugLog('channel-store', '  Raw packet length:', packet.length);
    debugLog('channel-store', '  Raw packet first 16 bytes:', packet.slice(0, 16));
    
    const decoded = decodePacket(packet);
    debugLog('channel-store', '  Decoded packet:', decoded);
    
    if (!decoded) {
      debugError('channel-store', '  ❌ Decoding failed - APPLYING EMERGENCY FIX');
      // Emergency fix: Force channels online when we get any synthesize packet
      channels.update(chs => {
        chs[0].online = true;
        chs[1].online = true;
        debugError('emergency', '    🚨 EMERGENCY: Forced channels 0,1 online due to decode failure');
        return chs;
      });
      waitingSynthesize.set(false);
      return;
    }

    const processed = processSynthesizePacket(decoded);
    debugLog('channel-store', '  Processed channels:', processed);

    if (processed) {
      debugLog('channel-store', '  🔄 Updating channel store...');
      debugLog('channel-store', '  Channels before update:');
      channels.update(chs => {
        debugLog('channel-store', '    Current channels:', chs.map(ch => ({ channel: ch.channel, online: ch.online })));
        
        processed.forEach((data, i) => {
          debugLog('channel-store', `    Updating channel ${i}:`, data);
          chs[i] = { ...chs[i], ...data, waveformData: chs[i].waveformData };
        });
        
        debugLog('channel-store', '    Updated channels:', chs.map(ch => ({ channel: ch.channel, online: ch.online })));
        return chs;
      });
      
      debugLog('channel-store', '  ✅ waitingSynthesize set to false');
      waitingSynthesize.set(false);
    } else {
      debugError('channel-store', '  ❌ Processing failed - APPLYING EMERGENCY FIX');
      // Emergency fix: Force channels online when processing fails
      channels.update(chs => {
        chs[0].online = true;
        chs[1].online = true;
        debugError('emergency', '    🚨 EMERGENCY: Forced channels 0,1 online due to processing failure');
        return chs;
      });
      waitingSynthesize.set(false);
    }
  }

  function waveHandler(packet) {
    const decoded = decodePacket(packet);
    if (!decoded) return;

    const processed = processWavePacket(decoded);
    
    if (processed) {
      channels.update(chs => {
        const ch = chs[processed.channel];
        if (ch && ch.recording) {
          ch.waveformData.push(...processed.points);
        }
        return chs;
      });
    }
  }

  function updateChannelHandler(packet) {
    const decoded = decodePacket(packet);
    if (!decoded) return;
    
    if (packet.length >= 7) {
      const channel = packet[6];
      activeChannel.set(channel);
    }
  }

  function addrHandler(packet) {
    const decoded = decodePacket(packet);
    if (!decoded) return;
    
    // Process address packet if needed
    // For now just decode it to see the data
  }

  function machineHandler(packet) {
    const decoded = decodePacket(packet);
    if (!decoded) return;
    
    const processed = processMachinePacket(decoded);
    
    if (processed) {
      serialConnection.deviceTypeStore.set(processed);
    }
  }

  debugLog('channel-store', '🔌 REGISTERING PACKET HANDLERS');
  debugLog('channel-store', '  SYNTHESIZE type:', PACKET_TYPES.SYNTHESIZE);
  debugLog('channel-store', '  WAVE type:', PACKET_TYPES.WAVE);
  debugLog('channel-store', '  ADDR type:', PACKET_TYPES.ADDR);
  debugLog('channel-store', '  UPDATE_CH type:', PACKET_TYPES.UPDATE_CH);
  debugLog('channel-store', '  MACHINE type:', PACKET_TYPES.MACHINE);
  
  serialConnection.registerPacketHandler(PACKET_TYPES.SYNTHESIZE, synthesizeHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.WAVE, waveHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.ADDR, addrHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.UPDATE_CH, updateChannelHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.MACHINE, machineHandler);
  
  debugLog('channel-store', '✅ All packet handlers registered');

  async function setActiveChannel(channel) {
    const packet = createSetChannelPacket(channel);
    await serialConnection.sendPacket(packet);
    activeChannel.set(channel);
  }

  async function setVoltage(channel, voltage, current) {
    const packet = createSetVoltagePacket(channel, voltage, current);
    await serialConnection.sendPacket(packet);
    
    channels.update(chs => {
      chs[channel].targetVoltage = voltage;
      chs[channel].targetCurrent = current;
      return chs;
    });
  }

  async function setCurrent(channel, voltage, current) {
    const packet = createSetCurrentPacket(channel, voltage, current);
    await serialConnection.sendPacket(packet);
    
    channels.update(chs => {
      chs[channel].targetVoltage = voltage;
      chs[channel].targetCurrent = current;
      return chs;
    });
  }

  async function setOutput(channel, enabled) {
    const packet = createSetOutputPacket(channel, enabled);
    await serialConnection.sendPacket(packet);
  }

  function startRecording(channel) {
    channels.update(chs => {
      chs[channel].recording = true;
      chs[channel].waveformData = [];
      return chs;
    });
  }

  function stopRecording(channel) {
    channels.update(chs => {
      chs[channel].recording = false;
      return chs;
    });
  }

  function clearRecording(channel) {
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