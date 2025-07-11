/**
 * Mock packet factory that creates properly structured packets matching Kaitai parser output
 */

import { PackType } from '../../src/lib/packet-decoder.js';

/**
 * Create a valid packet header
 */
function createHeader(type, size, channel = 0) {
  const header = new Uint8Array(6);
  header[0] = 0x5A;
  header[1] = 0x5A;
  header[2] = type;
  header[3] = size;
  header[4] = channel;
  header[5] = 0; // checksum placeholder
  return header;
}

/**
 * Calculate checksum for packet data
 */
function calculateChecksum(data) {
  let checksum = 0;
  for (let i = 0; i < data.length; i++) {
    checksum ^= data[i];
  }
  return checksum;
}

/**
 * Create a complete packet with header and data
 */
export function createPacket(type, size, channel, data) {
  const packet = new Uint8Array(size);
  const header = createHeader(type, size, channel);
  
  // Copy header
  for (let i = 0; i < 6; i++) {
    packet[i] = header[i];
  }
  
  // Copy data
  for (let i = 0; i < data.length; i++) {
    packet[6 + i] = data[i];
  }
  
  // Calculate and set checksum
  packet[5] = calculateChecksum(data);
  
  return packet;
}

/**
 * Create a synthesize packet with proper Kaitai structure
 */
export function createSynthesizePacket(channelData = []) {
  const data = new Uint8Array(150); // 6 channels * 25 bytes each
  let offset = 0;
  
  // Add channel and dummy bytes
  data[offset++] = 0; // channel
  data[offset++] = 0; // dummy
  
  // Fill 6 channels
  for (let i = 0; i < 6; i++) {
    const ch = channelData[i] || {};
    
    // Channel number
    data[offset++] = i;
    
    // Voltages and currents (little-endian)
    const outVoltage = ch.voltage !== undefined ? Math.round(ch.voltage * 1000) : 0;
    const outCurrent = ch.current !== undefined ? Math.round(ch.current * 1000) : 0;
    const inVoltage = ch.inVoltage !== undefined ? Math.round(ch.inVoltage * 1000) : 0;
    const inCurrent = ch.inCurrent !== undefined ? Math.round(ch.inCurrent * 1000) : 0;
    const setVoltage = ch.setVoltage !== undefined ? Math.round(ch.setVoltage * 1000) : 0;
    const setCurrent = ch.setCurrent !== undefined ? Math.round(ch.setCurrent * 1000) : 0;
    const tempRaw = ch.temperature !== undefined ? Math.round(ch.temperature * 10) : 0;
    
    // Write 16-bit values in little-endian
    data[offset++] = outVoltage & 0xFF;
    data[offset++] = (outVoltage >> 8) & 0xFF;
    data[offset++] = outCurrent & 0xFF;
    data[offset++] = (outCurrent >> 8) & 0xFF;
    data[offset++] = inVoltage & 0xFF;
    data[offset++] = (inVoltage >> 8) & 0xFF;
    data[offset++] = inCurrent & 0xFF;
    data[offset++] = (inCurrent >> 8) & 0xFF;
    data[offset++] = setVoltage & 0xFF;
    data[offset++] = (setVoltage >> 8) & 0xFF;
    data[offset++] = setCurrent & 0xFF;
    data[offset++] = (setCurrent >> 8) & 0xFF;
    data[offset++] = tempRaw & 0xFF;
    data[offset++] = (tempRaw >> 8) & 0xFF;
    
    // Status bytes
    data[offset++] = ch.online !== undefined ? (ch.online ? 1 : 0) : 0;
    data[offset++] = ch.machineType !== undefined ? ch.machineType : 2; // Default P906
    data[offset++] = ch.lock || 0;
    data[offset++] = ch.mode || 0; // statusLoad/statusPsu
    data[offset++] = ch.isOutput !== undefined ? (ch.isOutput ? 1 : 0) : 0;
    
    // Color (3 bytes)
    data[offset++] = 0;
    data[offset++] = 0;
    data[offset++] = 0;
    
    // Error and end marker
    data[offset++] = ch.error || 0;
    data[offset++] = 0xFF; // end marker
  }
  
  return createPacket(PackType.SYNTHESIZE, 156, 0, data);
}

/**
 * Create a wave packet with proper Kaitai structure
 */
export function createWavePacket(channel = 0, waveData = [], pointsPerGroup = 2) {
  const groupCount = 10;
  const size = pointsPerGroup === 2 ? 126 : 206;
  const dataSize = size - 6;
  const data = new Uint8Array(dataSize);
  
  // Channel and dummy
  data[0] = channel;
  data[1] = 0;
  
  let offset = 2;
  
  // Create 10 groups
  for (let g = 0; g < groupCount; g++) {
    // Timestamp (32-bit little-endian)
    const timestamp = (waveData[g]?.timestamp || g * 100);
    data[offset++] = timestamp & 0xFF;
    data[offset++] = (timestamp >> 8) & 0xFF;
    data[offset++] = (timestamp >> 16) & 0xFF;
    data[offset++] = (timestamp >> 24) & 0xFF;
    
    // Points in group
    for (let p = 0; p < pointsPerGroup; p++) {
      const pointIndex = g * pointsPerGroup + p;
      const point = waveData[pointIndex] || {};
      
      const voltage = point.voltage !== undefined ? Math.round(point.voltage * 1000) : 0;
      const current = point.current !== undefined ? Math.round(point.current * 1000) : 0;
      
      // Voltage (16-bit little-endian)
      data[offset++] = voltage & 0xFF;
      data[offset++] = (voltage >> 8) & 0xFF;
      
      // Current (16-bit little-endian)
      data[offset++] = current & 0xFF;
      data[offset++] = (current >> 8) & 0xFF;
    }
  }
  
  return createPacket(PackType.WAVE, size, channel, data);
}

/**
 * Create an address packet with proper Kaitai structure
 */
export function createAddressPacket(addresses = []) {
  const data = new Uint8Array(36); // 6 channels * 6 bytes each
  
  for (let i = 0; i < 6; i++) {
    const addr = addresses[i] || {};
    const offset = i * 6;
    
    // Address bytes (5 bytes)
    const addrBytes = addr.address || [0, 0, 0, 0, 0];
    for (let j = 0; j < 5; j++) {
      data[offset + j] = addrBytes[j] || 0;
    }
    
    // Frequency offset
    const frequency = addr.frequency || 2400;
    data[offset + 5] = frequency - 2400;
  }
  
  return createPacket(PackType.ADDR, 42, 0, data);
}

/**
 * Create a machine packet with proper Kaitai structure
 */
export function createMachinePacket(machineType = 0x10) {
  const data = new Uint8Array(1);
  data[0] = machineType; // 0x10 = M01 with LCD, 0x11 = M02 without LCD
  
  return createPacket(PackType.MACHINE, 7, 0, data);
}

/**
 * Create an update channel packet
 */
export function createUpdateChannelPacket(targetChannel = 0) {
  const data = new Uint8Array(1);
  data[0] = targetChannel;
  
  return createPacket(PackType.UPDAT_CH, 7, 0, data);
}

/**
 * Create an error 240 packet
 */
export function createError240Packet() {
  return createPacket(PackType.ERR_240, 6, 0, new Uint8Array(0));
}

/**
 * Create mock Kaitai parser output structure for testing
 */
export function createMockKaitaiPacket(type, mockData) {
  return {
    packType: type,
    size: 6,
    channel: 0,
    checksum: 0,
    data: mockData,
    _io: {},
    _parent: null,
    _root: null
  };
}

/**
 * Create mock synthesize data structure matching Kaitai output
 */
export function createMockSynthesizeData(channelData = []) {
  const channels = [];
  
  for (let i = 0; i < 6; i++) {
    const ch = channelData[i] || {};
    channels.push({
      num: i,
      outVoltageRaw: (ch.voltage || 0) * 1000,
      outCurrentRaw: (ch.current || 0) * 1000,
      inVoltageRaw: (ch.inVoltage || 0) * 1000,
      inCurrentRaw: (ch.inCurrent || 0) * 1000,
      setVoltageRaw: (ch.setVoltage || 0) * 1000,
      setCurrentRaw: (ch.setCurrent || 0) * 1000,
      tempRaw: (ch.temperature || 0) * 10,
      online: ch.online ? 1 : 0,
      type: ch.machineType || 2, // Default P906
      lock: 0,
      statusLoad: ch.statusLoad || 0,
      statusPsu: ch.statusPsu || 0,
      outputOn: ch.isOutput ? 1 : 0,
      color: [0, 0, 0],
      error: 0,
      end: [0xFF],
      // Computed properties
      get outVoltage() { return this.outVoltageRaw / 1000; },
      get outCurrent() { return this.outCurrentRaw / 1000; },
      get inVoltage() { return this.inVoltageRaw / 1000; },
      get inCurrent() { return this.inCurrentRaw / 1000; },
      get setVoltage() { return this.setVoltageRaw / 1000; },
      get setCurrent() { return this.setCurrentRaw / 1000; },
      get temperature() { return this.tempRaw / 10; }
    });
  }
  
  return {
    channel: 0,
    dummy: 0,
    channels: channels
  };
}

/**
 * Create mock wave data structure matching Kaitai output
 */
export function createMockWaveData(channel = 0, points = []) {
  const groups = [];
  const pointsPerGroup = 2;
  
  for (let g = 0; g < 10; g++) {
    const items = [];
    const timestamp = g * 100;
    
    for (let p = 0; p < pointsPerGroup; p++) {
      const pointIndex = g * pointsPerGroup + p;
      const point = points[pointIndex] || { voltage: 0, current: 0 };
      
      items.push({
        voltageRaw: point.voltage * 1000,
        currentRaw: point.current * 1000,
        get voltage() { return this.voltageRaw / 1000; },
        get current() { return this.currentRaw / 1000; }
      });
    }
    
    groups.push({
      timestamp: timestamp,
      items: items
    });
  }
  
  return {
    channel: channel,
    dummy: 0,
    groups: groups,
    get groupSize() { return pointsPerGroup; }
  };
}