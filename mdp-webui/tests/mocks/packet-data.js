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
    data.push(ch.online);
    data.push(ch.machineType);
    
    // Voltage (little-endian)
    data.push(ch.voltage & 0xFF);
    data.push((ch.voltage >> 8) & 0xFF);
    
    // Current (little-endian)
    data.push(ch.current & 0xFF);
    data.push((ch.current >> 8) & 0xFF);
    
    // Temperature
    data.push(ch.temperature & 0xFF);
    data.push((ch.temperature >> 8) & 0xFF);
    
    // Various status bytes
    data.push(ch.isOutput); // isOutput
    data.push(0); // p905_type
    data.push(ch.mode); // p906_type / l1060_type
    data.push(0); // errorCode
    
    // Address (5 bytes)
    if (ch.address) {
      data.push(...ch.address);
    } else {
      data.push(0x01, 0x02, 0x03, 0x04, 0x05); // Default address
    }
    
    // Padding to reach 25 bytes
    for (let j = 0; j < 8; j++) {
      data.push(0);
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

export function createWavePacket(channel = 0, points = []) {
  const packet = [0x5A, 0x5A, 0x12, 0x7E, channel];
  const data = [];
  
  // Create 10 groups
  for (let i = 0; i < 10; i++) {
    // Timestamp (4 bytes, little-endian)
    const timestamp = i * 100;
    data.push(timestamp & 0xFF);
    data.push((timestamp >> 8) & 0xFF);
    data.push((timestamp >> 16) & 0xFF);
    data.push((timestamp >> 24) & 0xFF);
    
    // 2 data points per group
    for (let j = 0; j < 2; j++) {
      const point = points[i * 2 + j] || { voltage: 3300, current: 500 };
      
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
  const packet = [0x5A, 0x5A, 0x15, 0x07, 0xEE, type, type];
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
    const addr = addresses[i] || {
      address: [0x00, 0x00, 0x00, 0x00, 0x00],
      frequencyOffset: 0
    };
    
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

