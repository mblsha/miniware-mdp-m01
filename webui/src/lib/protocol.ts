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

export type PacketDirection = 'device-to-host' | 'host-to-device' | 'either';

type PacketDefinition = {
  direction: Exclude<PacketDirection, 'either'>;
  sizes: ReadonlySet<number>;
  channel: 'indexed' | 'broadcast';
};

const PACKET_DEFINITIONS = new Map<number, PacketDefinition>([
  [PackType.SYNTHESIZE, { direction: 'device-to-host', sizes: new Set([156]), channel: 'indexed' }],
  [PackType.WAVE, { direction: 'device-to-host', sizes: new Set([126, 206]), channel: 'indexed' }],
  [PackType.ADDR, { direction: 'device-to-host', sizes: new Set([42]), channel: 'broadcast' }],
  [PackType.UPDAT_CH, { direction: 'device-to-host', sizes: new Set([7]), channel: 'indexed' }],
  [PackType.MACHINE, { direction: 'device-to-host', sizes: new Set([7]), channel: 'broadcast' }],
  [PackType.SET_ISOUTPUT, { direction: 'host-to-device', sizes: new Set([7]), channel: 'indexed' }],
  [PackType.GET_ADDR, { direction: 'host-to-device', sizes: new Set([6]), channel: 'broadcast' }],
  [PackType.SET_ADDR, { direction: 'host-to-device', sizes: new Set([12]), channel: 'indexed' }],
  [PackType.SET_CH, { direction: 'host-to-device', sizes: new Set([6]), channel: 'indexed' }],
  [PackType.SET_V, { direction: 'host-to-device', sizes: new Set([10]), channel: 'indexed' }],
  [PackType.SET_I, { direction: 'host-to-device', sizes: new Set([10]), channel: 'indexed' }],
  [PackType.SET_ALL_ADDR, { direction: 'host-to-device', sizes: new Set([42]), channel: 'broadcast' }],
  [PackType.START_AUTO_MATCH, { direction: 'host-to-device', sizes: new Set([6]), channel: 'broadcast' }],
  [PackType.STOP_AUTO_MATCH, { direction: 'host-to-device', sizes: new Set([6]), channel: 'broadcast' }],
  [PackType.RESET_TO_DFU, { direction: 'host-to-device', sizes: new Set([6]), channel: 'broadcast' }],
  [PackType.RGB, { direction: 'host-to-device', sizes: new Set([7]), channel: 'broadcast' }],
  [PackType.GET_MACHINE, { direction: 'host-to-device', sizes: new Set([6]), channel: 'broadcast' }],
  [PackType.HEARTBEAT, { direction: 'host-to-device', sizes: new Set([6]), channel: 'broadcast' }],
  // ERR_240 is present in the historical protocol but no v2.02 firmware send path
  // was found. Keep accepting it so old captures remain readable.
  [PackType.ERR_240, { direction: 'device-to-host', sizes: new Set([6]), channel: 'broadcast' }],
]);

export function isValidPacketSize(
  type: number,
  size: number,
  direction: PacketDirection = 'either'
): boolean {
  const definition = PACKET_DEFINITIONS.get(type);
  return Boolean(
    definition
      && Number.isInteger(size)
      && size >= 6
      && definition.sizes.has(size)
      && (direction === 'either' || definition.direction === direction)
  );
}

export function calculatePayloadChecksum(data: ArrayLike<number>, start = 6): number {
  let checksum = 0;
  for (let index = start; index < data.length; index += 1) {
    checksum ^= data[index];
  }
  return checksum;
}

export type ProtocolPacketValidation =
  | { ok: true; type: number; size: number; channel: number; checksum: number }
  | { ok: false; reason: string };

/**
 * Validate exactly one complete frame. This is deliberately stricter than the
 * controller firmware, whose unchecked channel and size fields can corrupt its
 * SRAM. Callers should never copy the firmware's permissive behaviour.
 */
export function validateProtocolPacket(
  data: ArrayLike<number> | null,
  direction: PacketDirection = 'either'
): ProtocolPacketValidation {
  if (!data || data.length < 6) {
    return { ok: false, reason: 'Packet must contain at least the 6-byte header' };
  }
  for (let index = 0; index < data.length; index += 1) {
    const byte = data[index];
    if (!Number.isInteger(byte) || byte < 0 || byte > 0xFF) {
      return { ok: false, reason: `Packet byte ${index} is outside the uint8 range` };
    }
  }
  if (data[0] !== 0x5A || data[1] !== 0x5A) {
    return { ok: false, reason: 'Packet magic must be 0x5A 0x5A' };
  }

  const type = data[2];
  const size = data[3];
  const channel = data[4];
  const checksum = data[5];
  if (data.length !== size) {
    return { ok: false, reason: `Declared packet size ${size} does not match ${data.length} bytes` };
  }
  if (!isValidPacketSize(type, size, direction)) {
    return { ok: false, reason: `Packet type 0x${type.toString(16)} has an invalid size or direction` };
  }

  const definition = PACKET_DEFINITIONS.get(type)!;
  if (definition.channel === 'indexed' && (channel < 0 || channel > 5)) {
    return { ok: false, reason: `Packet type 0x${type.toString(16)} requires channel 0-5` };
  }
  if (definition.channel === 'broadcast' && channel !== 0xEE) {
    return { ok: false, reason: `Packet type 0x${type.toString(16)} requires channel 0xEE` };
  }
  if (calculatePayloadChecksum(data) !== checksum) {
    return { ok: false, reason: 'Packet payload checksum does not match' };
  }

  if (type === PackType.UPDAT_CH && data[6] !== channel) {
    return { ok: false, reason: 'UPDATE_CH header and payload channels must match' };
  }

  return { ok: true, type, size, channel, checksum };
}

export function assertHostCommandPacket(data: ArrayLike<number> | null): void {
  const validation = validateProtocolPacket(data, 'host-to-device');
  if (!validation.ok) {
    throw new TypeError(`Invalid MDP host command: ${validation.reason}`);
  }
}

export type ExtractedPackets = {
  packets: number[][];
  /**
   * Complete frame candidates in wire order. Consumers that only want trusted
   * protocol traffic should use `packets`; diagnostic recorders can use this
   * list to retain malformed frames without dispatching them as telemetry.
   */
  frames: Array<
    | { packet: number[]; accepted: true }
    | { packet: number[]; accepted: false; reason: string }
  >;
  remainder: Uint8Array;
};

function findHeader(input: Uint8Array, start: number): number {
  for (let index = start; index <= input.length - 2; index += 1) {
    if (input[index] === 0x5A && input[index + 1] === 0x5A) return index;
  }
  return -1;
}

function findLaterCompletePacket(
  input: Uint8Array,
  start: number,
  direction: PacketDirection
): number {
  let candidate = findHeader(input, start);
  while (candidate >= 0) {
    if (input.length - candidate >= 6) {
      const size = input[candidate + 3];
      if (
        input.length - candidate >= size
        && validateProtocolPacket(input.slice(candidate, candidate + size), direction).ok
      ) {
        return candidate;
      }
    }
    candidate = findHeader(input, candidate + 1);
  }
  return -1;
}

/**
 * Extract complete device-to-host frames from an arbitrary serial byte stream.
 * Device TX is split into 64-byte USB transfers, so partial frames are normal;
 * several complete frames in one host read are normal as well.
 *
 * Invalid frames are skipped byte-by-byte. A false but plausible incomplete
 * header is abandoned if a later complete, checksummed frame is already in the
 * buffer, preventing corrupted input from blocking the parser indefinitely.
 */
export function extractProtocolPackets(
  input: Uint8Array,
  direction: PacketDirection = 'device-to-host'
): ExtractedPackets {
  const packets: number[][] = [];
  const frames: ExtractedPackets['frames'] = [];
  let offset = 0;

  while (input.length - offset >= 2) {
    const header = findHeader(input, offset);
    if (header === -1) {
      const keepTrailingHeaderByte = input[input.length - 1] === 0x5A;
      return {
        packets,
        frames,
        remainder: keepTrailingHeaderByte ? input.slice(input.length - 1) : new Uint8Array(),
      };
    }

    if (input.length - header < 4) {
      return { packets, frames, remainder: input.slice(header) };
    }

    const type = input[header + 2];
    const size = input[header + 3];
    if (!isValidPacketSize(type, size, direction)) {
      // A complete frame in the opposite direction is still useful to packet
      // observers (for example, a bidirectional capture). Never dispatch it
      // to direction-specific packet handlers.
      if (isValidPacketSize(type, size, 'either') && input.length - header >= size) {
        const candidate = input.slice(header, header + size);
        const validation = validateProtocolPacket(candidate, direction);
        frames.push({
          packet: Array.from(candidate),
          accepted: false,
          reason: validation.ok ? 'Packet was rejected by the selected direction' : validation.reason,
        });

        // A well-formed opposite-direction frame has an unambiguous boundary.
        // For other corruption, advance one byte so an embedded valid header
        // is not accidentally discarded.
        if (validateProtocolPacket(candidate, 'either').ok) {
          offset = header + size;
          continue;
        }
      }
      offset = header + 1;
      continue;
    }

    if (input.length - header < size) {
      const laterPacket = findLaterCompletePacket(input, header + 1, direction);
      if (laterPacket >= 0) {
        offset = laterPacket;
        continue;
      }
      return { packets, frames, remainder: input.slice(header) };
    }

    const frame = input.slice(header, header + size);
    const validation = validateProtocolPacket(frame, direction);
    if (!validation.ok) {
      frames.push({ packet: Array.from(frame), accepted: false, reason: validation.reason });
      offset = header + 1;
      continue;
    }

    const packet = Array.from(frame);
    packets.push(packet);
    frames.push({ packet, accepted: true });
    offset = header + size;
  }

  return {
    packets,
    frames,
    remainder: offset < input.length && input[offset] === 0x5A
      ? input.slice(offset)
      : new Uint8Array(),
  };
}
