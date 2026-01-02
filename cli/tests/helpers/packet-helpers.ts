/**
 * Packet helpers for testing - local copy to avoid webui tsconfig issues.
 * These mirror the packet-encoder.ts from webui.
 */

export const PacketType = {
  // Host -> Device
  SET_ISOUTPUT: 0x16,
  GET_ADDR: 0x17,
  SET_ADDR: 0x18,
  SET_CH: 0x19,
  SET_V: 0x1a,
  SET_I: 0x1b,
  SET_ALL_ADDR: 0x1c,
  START_AUTO_MATCH: 0x1d,
  STOP_AUTO_MATCH: 0x1e,
  RESET_TO_DFU: 0x1f,
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
  const packet = [0x5a, 0x5a, type, size, channel];

  const checksum = calculateChecksum(data);
  packet.push(checksum);
  packet.push(...data);

  return packet;
}

export function createHeartbeatPacket(): number[] {
  return createPacket(PacketType.HEARTBEAT, 0xee);
}

export function createGetMachinePacket(): number[] {
  return createPacket(PacketType.GET_MACHINE, 0xee);
}

export function createSetChannelPacket(channel: number): number[] {
  return createPacket(PacketType.SET_CH, channel);
}

function createVoltageCurrentPacket(
  type: number,
  channel: number,
  voltage: number,
  current: number
): number[] {
  const voltageMv = Math.round(voltage * 1000);
  const currentMa = Math.round(current * 1000);

  const data = [voltageMv & 0xff, (voltageMv >> 8) & 0xff, currentMa & 0xff, (currentMa >> 8) & 0xff];

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
  return createPacket(PacketType.GET_ADDR, 0xee);
}
