import { writable, derived } from 'svelte/store';
import { serialConnection } from '../serial';
import { decodePacket, processSynthesizePacket, processWavePacket, processMachinePacket } from '../packet-decoder';
import { createSetChannelPacket, createSetVoltagePacket, createSetCurrentPacket, createSetOutputPacket } from '../packet-encoder';

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
    const decoded = decodePacket(packet);
    if (!decoded) return;

    const processed = processSynthesizePacket(decoded);

    if (processed) {
      channels.update(chs => {
        processed.forEach((data, i) => {
          chs[i] = { ...chs[i], ...data, waveformData: chs[i].waveformData };
        });
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
    if (packet.length >= 7) {
      const channel = packet[6];
      activeChannel.set(channel);
    }
  }

  function machineHandler(packet) {
    const decoded = decodePacket(packet);
    if (!decoded) return;
    
    const processed = processMachinePacket(decoded);
    
    if (processed) {
      serialConnection.deviceTypeStore.set(processed);
    }
  }

  serialConnection.registerPacketHandler(PACKET_TYPES.SYNTHESIZE, synthesizeHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.WAVE, waveHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.UPDATE_CH, updateChannelHandler);
  serialConnection.registerPacketHandler(PACKET_TYPES.MACHINE, machineHandler);

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