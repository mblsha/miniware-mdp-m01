export const PackType = {
  SYNTHESIZE: 0x11,
  WAVE: 0x12,
  ADDR: 0x13,
  UPDAT_CH: 0x14,
  MACHINE: 0x15,
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
  HEARTBEAT: 0x22,
  ERR_240: 0x23,
} as const;

export const PacketType = PackType;

const PACKET_SIZES = new Map<number, ReadonlySet<number>>([
  [PackType.SYNTHESIZE, new Set([156])],
  [PackType.WAVE, new Set([126, 206])],
  [PackType.ADDR, new Set([42])],
  [PackType.UPDAT_CH, new Set([7])],
  [PackType.MACHINE, new Set([7])],
  [PackType.SET_ISOUTPUT, new Set([7])],
  [PackType.GET_ADDR, new Set([6])],
  [PackType.SET_ADDR, new Set([12])],
  [PackType.SET_CH, new Set([6])],
  [PackType.SET_V, new Set([10])],
  [PackType.SET_I, new Set([10])],
  [PackType.SET_ALL_ADDR, new Set([42])],
  [PackType.START_AUTO_MATCH, new Set([6])],
  [PackType.STOP_AUTO_MATCH, new Set([6])],
  [PackType.RESET_TO_DFU, new Set([6])],
  [PackType.RGB, new Set([7])],
  [PackType.GET_MACHINE, new Set([6])],
  [PackType.HEARTBEAT, new Set([6])],
  [PackType.ERR_240, new Set([6])],
]);

export function isValidPacketSize(type: number, size: number): boolean {
  return Number.isInteger(size) && size >= 6 && (PACKET_SIZES.get(type)?.has(size) ?? false);
}

export type ExtractedPackets = {
  packets: number[][];
  remainder: Uint8Array;
};

/**
 * Extract complete protocol frames while retaining a possible partial frame.
 * Malformed headers, unknown packet types, and invalid declared sizes are
 * consumed one byte at a time so the caller can never enter a tight loop.
 */
export function extractProtocolPackets(input: Uint8Array): ExtractedPackets {
  const packets: number[][] = [];
  let offset = 0;

  while (input.length - offset >= 2) {
    let header = -1;
    for (let index = offset; index <= input.length - 2; index += 1) {
      if (input[index] === 0x5A && input[index + 1] === 0x5A) {
        header = index;
        break;
      }
    }

    if (header === -1) {
      const keepTrailingHeaderByte = input[input.length - 1] === 0x5A;
      return {
        packets,
        remainder: keepTrailingHeaderByte ? input.slice(input.length - 1) : new Uint8Array(),
      };
    }

    if (input.length - header < 4) {
      return { packets, remainder: input.slice(header) };
    }

    const type = input[header + 2];
    const size = input[header + 3];
    if (!isValidPacketSize(type, size)) {
      offset = header + 1;
      continue;
    }

    if (input.length - header < size) {
      return { packets, remainder: input.slice(header) };
    }

    packets.push(Array.from(input.slice(header, header + size)));
    offset = header + size;
  }

  return {
    packets,
    remainder: offset < input.length && input[offset] === 0x5A
      ? input.slice(offset)
      : new Uint8Array(),
  };
}
