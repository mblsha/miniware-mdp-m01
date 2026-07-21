import { PacketType } from './protocol';

export { PacketType } from './protocol';

const MAX_CHANNEL = 5;
const BROADCAST_CHANNEL = 0xEE;
const MAX_U16 = 0xFFFF;

function assertIntegerInRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
  }
}

function assertChannel(channel: number, allowBroadcast = false): void {
  if (allowBroadcast && channel === BROADCAST_CHANNEL) return;
  assertIntegerInRange('Channel', channel, 0, MAX_CHANNEL);
}

function assertByte(name: string, value: number): void {
  assertIntegerInRange(name, value, 0, 0xFF);
}

function toU16Milliunits(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
  const encoded = Math.round(value * 1000);
  if (encoded > MAX_U16) {
    throw new RangeError(`${name} exceeds the protocol maximum of 65.535`);
  }
  return encoded;
}

function calculateChecksum(data: number[]): number {
  let checksum = 0;
  for (const byte of data) {
    checksum ^= byte;
  }
  return checksum;
}

function createPacket(type: number, channel: number, data: number[] = []): number[] {
  assertByte('Packet type', type);
  assertChannel(channel, true);
  data.forEach((byte, index) => assertByte(`Data byte ${index}`, byte));
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
  assertChannel(channel);
  return createPacket(PacketType.SET_CH, channel);
}

function createVoltageCurrentPacket(type: number, channel: number, voltage: number, current: number): number[] {
  assertChannel(channel);
  const voltageMv = toU16Milliunits('Voltage', voltage);
  const currentMa = toU16Milliunits('Current', current);

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
  assertChannel(channel);
  const data = [enabled ? 1 : 0];
  return createPacket(PacketType.SET_ISOUTPUT, channel, data);
}

export function createGetAddressPacket(): number[] {
  return createPacket(PacketType.GET_ADDR, 0xEE);
}

export function createSetAddressPacket(channel: number, address: number[], frequencyOffset: number): number[] {
  assertChannel(channel);
  if (address.length !== 5) {
    throw new Error('Address must be 5 bytes');
  }
  address.forEach((byte, index) => assertByte(`Address byte ${index}`, byte));
  assertIntegerInRange('Frequency offset', frequencyOffset, 0, 83);
  
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
    addr.address.forEach((byte, index) => assertByte(`Address byte ${index}`, byte));
    assertIntegerInRange('Frequency offset', addr.frequencyOffset, 0, 83);
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
