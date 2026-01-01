// Packet types from protocol
export const PacketType = {
  // Host -> Device
  SET_ISOUTPUT: 0x16,
  GET_ADDR: 0x17,
  SET_ADDR: 0x18,
  SET_CH: 0x19,
  SET_V: 0x1A,
  SET_I: 0x1B,
  SET_ALL_ADDR: 0x1C,
  START_AUTO_MATCH: 0x1D,
  STOP_AUTO_MATCH: 0x1E,
  RESET_TO_DFU: 0x1F,
  RGB: 0x20,
  GET_MACHINE: 0x21,
  HEARTBEAT: 0x22
};

function calculateChecksum(data: number[]): number {
  let checksum = 0;
  for (const byte of data) {
    checksum ^= byte;
  }
  return checksum;
}

function createPacket(type: number, channel: number, data: number[] = []): number[] {
  const size = 6 + data.length;
  const packet = [0x5A, 0x5A, type, size, channel];
  
  const checksum = calculateChecksum(data);
  packet.push(checksum);
  packet.push(...data);
  
  return packet;
}

export function createHeartbeatPacket(): number[] {
  return createPacket(PacketType.HEARTBEAT, 0xEE);
}

export function createGetMachinePacket(): number[] {
  return createPacket(PacketType.GET_MACHINE, 0xEE);
}

export function createSetChannelPacket(channel: number): number[] {
  return createPacket(PacketType.SET_CH, channel);
}

function createVoltageCurrentPacket(type: number, channel: number, voltage: number, current: number): number[] {
  const voltageMv = Math.round(voltage * 1000);
  const currentMa = Math.round(current * 1000);

  const data = [
    voltageMv & 0xFF,
    (voltageMv >> 8) & 0xFF,
    currentMa & 0xFF,
    (currentMa >> 8) & 0xFF
  ];

  return createPacket(type, channel, data);
}

export function createSetVoltagePacket(channel: number, voltage: number, current: number): number[] {
  return createVoltageCurrentPacket(PacketType.SET_V, channel, voltage, current);
}

export function createSetCurrentPacket(channel: number, voltage: number, current: number): number[] {
  return createVoltageCurrentPacket(PacketType.SET_I, channel, voltage, current);
}

export function createSetOutputPacket(channel: number, enabled: boolean): number[] {
  const data = [enabled ? 1 : 0];
  return createPacket(PacketType.SET_ISOUTPUT, channel, data);
}

export function createGetAddressPacket(): number[] {
  return createPacket(PacketType.GET_ADDR, 0xEE);
}

export function createSetAddressPacket(channel: number, address: number[], frequencyOffset: number): number[] {
  if (address.length !== 5) {
    throw new Error('Address must be 5 bytes');
  }
  
  const data = [...address, frequencyOffset];
  return createPacket(PacketType.SET_ADDR, channel, data);
}

export function createSetAllAddressPacket(addresses: Array<{address: number[], frequencyOffset: number}>): number[] {
  if (addresses.length !== 6) {
    throw new Error('Must provide addresses for all 6 channels');
  }
  
  const data: number[] = [];
  for (const addr of addresses) {
    if (addr.address.length !== 5) {
      throw new Error('Each address must be 5 bytes');
    }
    data.push(...addr.address, addr.frequencyOffset);
  }
  
  return createPacket(PacketType.SET_ALL_ADDR, 0xEE, data);
}

export function createStartAutoMatchPacket(): number[] {
  return createPacket(PacketType.START_AUTO_MATCH, 0xEE);
}

export function createStopAutoMatchPacket(): number[] {
  return createPacket(PacketType.STOP_AUTO_MATCH, 0xEE);
}

export function createResetToDfuPacket(): number[] {
  return createPacket(PacketType.RESET_TO_DFU, 0xEE);
}

export function createRgbPacket(enabled: boolean): number[] {
  const data = [enabled ? 1 : 0];
  return createPacket(PacketType.RGB, 0xEE, data);
}
