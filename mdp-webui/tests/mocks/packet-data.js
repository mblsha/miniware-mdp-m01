// Mock packet data for testing

export function createSynthesizePacket(channelData = []) {
  const packet = [0x5A, 0x5A, 0x11, 0x9C, 0x00];
  const data = [];
  
  // Create 6 channels worth of data
  for (let i = 0; i < 6; i++) {
    const ch = channelData[i] || {
      online: i === 0 ? 1 : 0,
      machineType: 1, // P906
      voltage: 3300, // mV
      current: 500,  // mA
      temperature: 255, // 25.5°C
      isOutput: 1,
      mode: 2, // CV
      address: [0x01, 0x02, 0x03, 0x04, 0x05]
    };
    
    // Channel data (25 bytes each)
    // num (channel number)
    data.push(i);
    
    // outVoltageRaw (little-endian)
    const outVoltage = ch.voltage || 0;
    data.push(outVoltage & 0xFF);
    data.push((outVoltage >> 8) & 0xFF);
    
    // outCurrentRaw (little-endian)
    const outCurrent = ch.current || 0;
    data.push(outCurrent & 0xFF);
    data.push((outCurrent >> 8) & 0xFF);
    
    // inVoltageRaw (little-endian) - same as out for simplicity
    data.push(outVoltage & 0xFF);
    data.push((outVoltage >> 8) & 0xFF);
    
    // inCurrentRaw (little-endian)
    data.push(outCurrent & 0xFF);
    data.push((outCurrent >> 8) & 0xFF);
    
    // setVoltageRaw (little-endian)
    data.push(outVoltage & 0xFF);
    data.push((outVoltage >> 8) & 0xFF);
    
    // setCurrentRaw (little-endian)
    data.push(outCurrent & 0xFF);
    data.push((outCurrent >> 8) & 0xFF);
    
    // tempRaw (little-endian)
    const temp = ch.temperature || 255;
    data.push(temp & 0xFF);
    data.push((temp >> 8) & 0xFF);
    
    // online
    data.push(ch.online || 0);
    
    // type (machine type)
    data.push(ch.machineType || 2); // Default to P906
    
    // lock
    data.push(0);
    
    // statusLoad/statusPsu
    data.push(ch.mode || 0);
    
    // outputOn
    data.push(ch.isOutput || 0);
    
    // color (3 bytes)
    data.push(0, 0, 0);
    
    // error
    data.push(0);
    
    // end
    data.push(0xFF);
  }
  
  // Calculate checksum
  let checksum = 0;
  for (const byte of data) {
    checksum ^= byte;
  }
  packet.push(checksum);
  packet.push(...data);
  
  return new Uint8Array(packet);
}

export function createWavePacket(channel = 0, sizeOrPoints = []) {
  // If second parameter is a number, it's the packet size
  const isSize = typeof sizeOrPoints === 'number';
  const size = isSize ? sizeOrPoints : 126;
  const points = isSize ? [] : sizeOrPoints;
  
  const packet = [0x5A, 0x5A, 0x12, size, channel];
  const data = [];
  
  // Determine points per group based on size
  const pointsPerGroup = size === 126 ? 2 : 4;
  
  // Create 10 groups
  for (let i = 0; i < 10; i++) {
    // Timestamp (4 bytes, little-endian) - start from 100ms to make it > 0
    const timestamp = (i + 1) * 100;
    data.push(timestamp & 0xFF);
    data.push((timestamp >> 8) & 0xFF);
    data.push((timestamp >> 16) & 0xFF);
    data.push((timestamp >> 24) & 0xFF);
    
    // Variable number of data points per group
    for (let j = 0; j < pointsPerGroup; j++) {
      const point = points[i * pointsPerGroup + j] || { voltage: 3300, current: 500 };
      
      // Voltage (little-endian)
      data.push(point.voltage & 0xFF);
      data.push((point.voltage >> 8) & 0xFF);
      
      // Current (little-endian)
      data.push(point.current & 0xFF);
      data.push((point.current >> 8) & 0xFF);
    }
  }
  
  // Calculate checksum
  let checksum = 0;
  for (const byte of data) {
    checksum ^= byte;
  }
  packet.push(checksum);
  packet.push(...data);
  
  return new Uint8Array(packet);
}

export function createMachinePacket(type = 0x10) {
  const packet = [0x5A, 0x5A, 0x15, 0x09, 0xEE]; // Size is 9 (6 header + 3 data)
  const data = [0xEE, 0x00, type]; // channel, dummy, machineTypeRaw
  
  // Calculate checksum
  let checksum = 0;
  for (const byte of data) {
    checksum ^= byte;
  }
  packet.push(checksum);
  packet.push(...data);
  
  return new Uint8Array(packet);
}

export function createUpdateChannelPacket(channel = 0) {
  const packet = [0x5A, 0x5A, 0x14, 0x07, 0xEE, channel, channel];
  return new Uint8Array(packet);
}

export function createAddressPacket(addresses = []) {
  const packet = [0x5A, 0x5A, 0x13, 0x2A, 0xEE];
  const data = [];
  
  // 6 channels × 6 bytes each
  for (let i = 0; i < 6; i++) {
    const addr = addresses[i] || (i === 0 ? {
      address: [0x01, 0x02, 0x03, 0x04, 0x05], // Default test data only for first channel
      frequencyOffset: 40  // 2400 + 40 = 2440 MHz
    } : {
      address: [0x00, 0x00, 0x00, 0x00, 0x00], // Empty for other channels
      frequencyOffset: 0
    });
    
    data.push(...addr.address);
    data.push(addr.frequencyOffset);
  }
  
  // Calculate checksum
  let checksum = 0;
  for (const byte of data) {
    checksum ^= byte;
  }
  packet.push(checksum);
  packet.push(...data);
  
  return new Uint8Array(packet);
}

export function createError240Packet() {
  const packet = [0x5A, 0x5A, 0x23, 0x06, 0xEE, 0x00];
  return new Uint8Array(packet);
}

// Helper to create partial/malformed packets for error testing
export function createMalformedPacket(type = 'short') {
  switch (type) {
    case 'short':
      return new Uint8Array([0x5A, 0x5A, 0x11]); // Too short
    case 'bad-header':
      return new Uint8Array([0x5B, 0x5A, 0x11, 0x06, 0x00, 0x00]); // Wrong header
    case 'bad-checksum':
      const packet = [0x5A, 0x5A, 0x15, 0x07, 0xEE, 0xFF, 0x10]; // Wrong checksum
      return new Uint8Array(packet);
    case 'invalid-size':
      return new Uint8Array([0x5A, 0x5A, 0x11, 0xFF, 0x00, 0x00]); // Size too large
    default:
      return new Uint8Array([]);
  }
}

// Helper to create a sequence of packets
export function createPacketSequence(packets) {
  const combined = [];
  for (const packet of packets) {
    combined.push(...packet);
  }
  return new Uint8Array(combined);
}

// Mock data for different scenarios
export const mockScenarios = {
  // Initial connection scenario
  connection: [
    createMachinePacket(0x10), // M01 device
    createSynthesizePacket([
      { online: 1, machineType: 0, voltage: 5000, current: 1000 }, // P905
      { online: 1, machineType: 1, voltage: 3300, current: 500 },  // P906
      { online: 1, machineType: 2, voltage: 0, current: 2000 },     // L1060
    ])
  ],
  
  // Recording scenario with wave packets
  recording: [
    createWavePacket(0, [
      { voltage: 3300, current: 500 },
      { voltage: 3310, current: 505 },
      { voltage: 3320, current: 510 },
      { voltage: 3330, current: 515 },
    ]),
    createWavePacket(0, [
      { voltage: 3340, current: 520 },
      { voltage: 3350, current: 525 },
      { voltage: 3360, current: 530 },
      { voltage: 3370, current: 535 },
    ])
  ],
  
  // Error scenario
  errors: [
    createMalformedPacket('short'),
    createError240Packet(),
    createMalformedPacket('bad-checksum')
  ]
};

