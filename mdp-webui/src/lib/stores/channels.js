import { writable, derived } from 'svelte/store';
import { serialConnection } from '../serial.js';
import { decodePacket, processSynthesizePacket, processWavePacket, processMachinePacket } from '../packet-decoder.js';
import { createSetChannelPacket, createSetVoltagePacket, createSetCurrentPacket, createSetOutputPacket } from '../packet-encoder.js';

const PACKET_TYPES = {
  SYNTHESIZE: 0x11,
  WAVE: 0x12,
  ADDR: 0x13,
  UPDATE_CH: 0x14,
  MACHINE: 0x15
};

function createChannelStore() {
  const channels = writable(Array(6).fill(null).map((_, i) => ({
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
  })));

  const activeChannel = writable(0);
  const waitingSynthesize = writable(true);

  // Register packet handlers
  serialConnection.registerPacketHandler(PACKET_TYPES.SYNTHESIZE, (packet) => {
    const decoded = decodePacket(packet);
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
  });

  serialConnection.registerPacketHandler(PACKET_TYPES.WAVE, (packet) => {
    const decoded = decodePacket(packet);
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
  });

  serialConnection.registerPacketHandler(PACKET_TYPES.UPDATE_CH, (packet) => {
    if (packet.length >= 7) {
      const channel = packet[6];
      activeChannel.set(channel);
    }
  });

  serialConnection.registerPacketHandler(PACKET_TYPES.MACHINE, (packet) => {
    const decoded = decodePacket(packet);
    const processed = processMachinePacket(decoded);
    
    if (processed) {
      serialConnection.deviceTypeStore.set(processed);
    }
  });

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

  return {
    channels: derived(channels, $channels => $channels),
    activeChannel: derived(activeChannel, $active => $active),
    waitingSynthesize: derived(waitingSynthesize, $waiting => $waiting),
    setActiveChannel,
    setVoltage,
    setCurrent,
    setOutput,
    startRecording,
    stopRecording,
    clearRecording
  };
}

export const channelStore = createChannelStore();