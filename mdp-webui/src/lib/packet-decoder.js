import KaitaiStream from 'kaitai-struct/KaitaiStream';
import MiniwareMdpM01 from './kaitai/MiniwareMdpM01.js';

export function decodePacket(data) {
  try {
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
  if (!packet || !packet.body || !packet.body.synthesize) return null;
  
  const synthesize = packet.body.synthesize;
  const channels = [];
  
  for (let i = 0; i < 6; i++) {
    const ch = synthesize.channels[i];
    channels.push({
      channel: i,
      online: ch.online !== 0,
      machineType: getMachineTypeString(ch.machineType),
      voltage: ch.voltage / 1000, // Convert mV to V
      current: ch.current / 1000, // Convert mA to A
      power: (ch.voltage * ch.current) / 1000000, // W
      temperature: ch.temperature / 10, // Convert to °C
      isOutput: ch.isOutput !== 0,
      mode: getOperatingMode(ch),
      address: ch.address
    });
  }
  
  return channels;
}

export function processWavePacket(packet) {
  if (!packet || !packet.body || !packet.body.wave) return null;
  
  const wave = packet.body.wave;
  const points = [];
  
  wave.groups.forEach((group, groupIndex) => {
    group.datas.forEach((data, pointIndex) => {
      points.push({
        timestamp: group.time + pointIndex * 10, // 10ms between points
        voltage: data.voltage / 1000, // Convert mV to V
        current: data.current / 1000  // Convert mA to A
      });
    });
  });
  
  return {
    channel: packet.channel,
    points
  };
}

export function processAddressPacket(packet) {
  if (!packet || !packet.body || !packet.body.addr) return null;
  
  const addr = packet.body.addr;
  const addresses = [];
  
  for (let i = 0; i < 6; i++) {
    const ch = addr.channels[i];
    addresses.push({
      channel: i,
      address: Array.from(ch.address),
      frequency: 2400 + ch.frequencyOffset // MHz
    });
  }
  
  return addresses;
}

export function processMachinePacket(packet) {
  if (!packet || !packet.body || packet.body.machine === undefined) return null;
  
  const machineType = packet.body.machine;
  return {
    type: machineType === 0x10 ? 'M01' : 'M02',
    hasLCD: machineType === 0x10
  };
}

function getMachineTypeString(type) {
  switch(type) {
    case 0: return 'P905';
    case 1: return 'P906';
    case 2: return 'L1060';
    default: return 'Unknown';
  }
}

function getOperatingMode(channel) {
  if (channel.machineType === 2) { // L1060
    switch(channel.l1060Type) {
      case 0: return 'CC';
      case 1: return 'CV';
      case 2: return 'CR';
      case 3: return 'CP';
    }
  } else if (channel.machineType === 1) { // P906
    switch(channel.p906Type) {
      case 1: return 'CC';
      case 2: return 'CV';
      default: return 'Normal';
    }
  }
  return 'Normal';
}