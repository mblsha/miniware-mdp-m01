import { decodePacket as kaitaiDecodePacket, PackType } from './packet-decoder.js';

/**
 * Adapter layer that normalizes Kaitai parser output and adds defensive checks
 * This ensures consistent property access and prevents undefined errors
 */

export { PackType };

/**
 * Safe property getter with default value
 */
function safeGet(obj, path, defaultValue) {
  return path.split('.').reduce((acc, part) => acc?.[part], obj) ?? defaultValue;
}

/**
 * Decode packet with normalized output structure
 */
export function decodePacket(data) {
  try {
    const packet = kaitaiDecodePacket(data);
    if (!packet) return null;
    
    // Add normalized accessors
    return new NormalizedPacket(packet);
  } catch (error) {
    console.error('Failed to decode packet:', error);
    return null;
  }
}

/**
 * Normalized packet wrapper that provides consistent property access
 */
class NormalizedPacket {
  constructor(kaitaiPacket) {
    this._packet = kaitaiPacket;
  }
  
  get packType() {
    return this._packet.packType;
  }
  
  get size() {
    return this._packet.size;
  }
  
  get channel() {
    return this._packet.channel;
  }
  
  get data() {
    return this._packet.data;
  }
  
  get raw() {
    return this._packet;
  }
}

/**
 * Process synthesize packet with defensive property access
 */
export function processSynthesizePacket(packet) {
  if (!packet || packet.packType !== PackType.SYNTHESIZE) return null;
  
  const data = packet.data || packet.raw?.data;
  if (!data || !data.channels) return null;
  
  const channels = [];
  
  for (let i = 0; i < 6; i++) {
    const ch = data.channels[i];
    if (!ch) {
      // Create default channel if missing
      channels.push({
        channel: i,
        online: false,
        machineType: 'Unknown',
        voltage: 0,
        current: 0,
        power: 0,
        temperature: 0,
        isOutput: false,
        mode: 'Normal'
      });
      continue;
    }
    
    // Safe property access with defaults
    const voltage = safeGet(ch, 'outVoltage', 0);
    const current = safeGet(ch, 'outCurrent', 0);
    
    channels.push({
      channel: i,
      online: safeGet(ch, 'online', 0) !== 0,
      machineType: getMachineTypeString(safeGet(ch, 'type', 0)),
      voltage: voltage,
      current: current,
      power: voltage * current,
      temperature: safeGet(ch, 'temperature', 0),
      isOutput: safeGet(ch, 'outputOn', 0) !== 0,
      mode: getOperatingMode(ch)
    });
  }
  
  return channels;
}

/**
 * Process wave packet with defensive property access
 */
export function processWavePacket(packet) {
  if (!packet || packet.packType !== PackType.WAVE) return null;
  
  const data = packet.data || packet.raw?.data;
  if (!data || !data.groups) return null;
  
  const points = [];
  
  // Handle both 'groups' and 'datas' property names for compatibility
  const groups = data.groups || data.datas || [];
  
  groups.forEach((group, groupIndex) => {
    if (!group) return;
    
    // Handle both 'items' and 'points' property names
    const items = group.items || group.points || [];
    const timestamp = safeGet(group, 'timestamp', groupIndex * 100);
    
    items.forEach((item, pointIndex) => {
      if (!item) return;
      
      points.push({
        timestamp: timestamp + pointIndex * 10, // 10ms between points
        voltage: safeGet(item, 'voltage', 0),
        current: safeGet(item, 'current', 0)
      });
    });
  });
  
  return {
    channel: safeGet(data, 'channel', 0),
    points
  };
}

/**
 * Process address packet with defensive property access
 */
export function processAddressPacket(packet) {
  if (!packet || packet.packType !== PackType.ADDR) return null;
  
  const data = packet.data || packet.raw?.data;
  if (!data || !data.addresses) return null;
  
  const addresses = [];
  
  for (let i = 0; i < 6; i++) {
    const ch = data.addresses[i];
    if (!ch) {
      addresses.push({
        channel: i,
        address: [0, 0, 0, 0, 0],
        frequency: 2400
      });
      continue;
    }
    
    // Handle different address formats
    let address;
    if (ch.address && Array.isArray(ch.address)) {
      address = Array.from(ch.address);
    } else if (ch.addrByte0 !== undefined) {
      // Handle individual byte properties
      address = [
        safeGet(ch, 'addrByte0', 0),
        safeGet(ch, 'addrByte1', 0),
        safeGet(ch, 'addrByte2', 0),
        safeGet(ch, 'addrByte3', 0),
        safeGet(ch, 'addrByte4', 0)
      ];
    } else {
      address = [0, 0, 0, 0, 0];
    }
    
    addresses.push({
      channel: i,
      address: address,
      frequency: 2400 + safeGet(ch, 'frequencyOffset', 0)
    });
  }
  
  return addresses;
}

/**
 * Process machine packet with defensive property access
 */
export function processMachinePacket(packet) {
  if (!packet || packet.packType !== PackType.MACHINE) return null;
  
  const data = packet.data || packet.raw?.data;
  if (!data) return null;
  
  // Try multiple property names for compatibility
  const machineTypeValue = data.machineTypeRaw || data.deviceType || data.machineType || 0x11;
  
  return {
    type: machineTypeValue === 0x10 ? 'M01' : 'M02',
    hasLCD: machineTypeValue === 0x10
  };
}

/**
 * Get machine type string from numeric type
 */
function getMachineTypeString(type) {
  switch(type) {
    case 0: return 'Node';
    case 1: return 'P905';
    case 2: return 'P906';
    case 3: return 'L1060';
    default: return 'Unknown';
  }
}

/**
 * Get operating mode based on channel type and status
 */
function getOperatingMode(channel) {
  if (!channel) return 'Normal';
  
  const type = safeGet(channel, 'type', 0);
  
  if (type === 3) { // L1060
    const statusLoad = safeGet(channel, 'statusLoad', 0);
    switch(statusLoad) {
      case 0: return 'CC';
      case 1: return 'CV';
      case 2: return 'CR';
      case 3: return 'CP';
      default: return 'Normal';
    }
  } else if (type === 2) { // P906
    const statusPsu = safeGet(channel, 'statusPsu', 0);
    switch(statusPsu) {
      case 1: return 'CC';
      case 2: return 'CV';
      default: return 'Normal';
    }
  }
  
  return 'Normal';
}

/**
 * Create a mock packet for testing that matches Kaitai structure
 */
export function createMockPacket(type, data) {
  return {
    packType: type,
    size: 6,
    channel: 0,
    data: data,
    raw: {
      packType: type,
      size: 6,
      channel: 0,
      data: data
    }
  };
}