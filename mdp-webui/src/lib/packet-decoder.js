import KaitaiStream from 'kaitai-struct/KaitaiStream';
import MiniwareMdpM01 from './kaitai/MiniwareMdpM01.js';

export const PackType = MiniwareMdpM01.PackType;

export function decodePacket(data) {
  try {
    if (!data || data.length < 6) return null;

    const buffer = new ArrayBuffer(data.length);
    const view = new Uint8Array(buffer);
    data.forEach((byte, i) => view[i] = byte);
    
    const stream = new KaitaiStream(buffer);
    const parsed = new MiniwareMdpM01(stream);
    
    return parsed;
  } catch (error) {
    console.error('Failed to decode packet:', error);
    return null;
  }
}

export function processSynthesizePacket(packet) {
  if (!packet || !packet.data || packet.packType !== PackType.SYNTHESIZE) return null;
  
  const synthesize = packet.data;
  const channels = [];
  
  for (let i = 0; i < 6; i++) {
    const ch = synthesize.channels[i];
    channels.push({
      channel: i,
      online: ch.online !== 0,
      machineType: getMachineTypeString(ch.type),
      voltage: ch.outVoltage, // Kaitai already converts to V
      current: ch.outCurrent, // Kaitai already converts to A
      power: ch.outVoltage * ch.outCurrent, // W
      temperature: ch.temperature, // Kaitai already converts to °C
      isOutput: ch.outputOn !== 0,
      mode: getOperatingMode(ch)
    });
  }
  
  return channels;
}

export function processWavePacket(packet) {
  if (!packet || !packet.data || packet.packType !== PackType.WAVE) return null;
  
  const wave = packet.data;
  const points = [];
  
  wave.groups.forEach((group, groupIndex) => {
    group.items.forEach((item, pointIndex) => {
      points.push({
        timestamp: group.timestamp + pointIndex * 10, // 10ms between points
        voltage: item.voltage, // Kaitai already converts to V
        current: item.current  // Kaitai already converts to A
      });
    });
  });
  
  return {
    channel: packet.data.channel,
    points
  };
}

export function processAddressPacket(packet) {
  if (!packet || !packet.data || packet.packType !== PackType.ADDR) return null;
  
  const addr = packet.data;
  const addresses = [];
  
  for (let i = 0; i < 6; i++) {
    const ch = addr.addresses[i];
    addresses.push({
      channel: i,
      address: Array.from(ch.address), // Keep as is for tests
      frequency: 2400 + ch.frequencyOffset // MHz
    });
  }
  
  return addresses;
}

export function processMachinePacket(packet) {
  if (!packet || !packet.data || packet.packType !== PackType.MACHINE) return null;
  
  const machine = packet.data;
  
  // Use machineTypeRaw if available, otherwise fall back to deviceType
  const machineTypeValue = machine.machineTypeRaw || machine.deviceType;
  
  return {
    type: machineTypeValue === 0x10 ? 'M01' : 'M02',
    hasLCD: machineTypeValue === 0x10
  };
}

function getMachineTypeString(type) {
  switch(type) {
    case 0: return 'Node';
    case 1: return 'P905';
    case 2: return 'P906';
    case 3: return 'L1060';
    default: return 'Unknown';
  }
}

function getOperatingMode(channel) {
  if (channel.type === 3) { // L1060
    switch(channel.statusLoad) {
      case 0: return 'CC';
      case 1: return 'CV';
      case 2: return 'CR';
      case 3: return 'CP';
    }
  } else if (channel.type === 2) { // P906
    switch(channel.statusPsu) {
      case 1: return 'CC';
      case 2: return 'CV';
      default: return 'Normal';
    }
  }
  return 'Normal';
}