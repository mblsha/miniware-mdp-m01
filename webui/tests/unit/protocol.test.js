import { describe, expect, it } from 'vitest';
import { extractProtocolPackets, isValidPacketSize, PackType } from '$lib/protocol.js';

describe('protocol framing', () => {
  it('rejects zero-sized frames and recovers to the next valid packet', () => {
    const malformed = [0x5A, 0x5A, PackType.MACHINE, 0, 0, 0];
    const heartbeat = [0x5A, 0x5A, PackType.HEARTBEAT, 6, 0xEE, 0];

    const result = extractProtocolPackets(Uint8Array.from([...malformed, ...heartbeat]));

    expect(result.packets).toEqual([heartbeat]);
    expect(result.remainder).toHaveLength(0);
  });

  it('retains a partial packet across reads', () => {
    const machine = [0x5A, 0x5A, PackType.MACHINE, 7, 0xEE, 0x10, 0x10];
    const first = extractProtocolPackets(Uint8Array.from(machine.slice(0, 4)));
    expect(first.packets).toHaveLength(0);
    expect(Array.from(first.remainder)).toEqual(machine.slice(0, 4));

    const second = extractProtocolPackets(Uint8Array.from([
      ...first.remainder,
      ...machine.slice(4),
    ]));
    expect(second.packets).toEqual([machine]);
    expect(second.remainder).toHaveLength(0);
  });

  it('validates type-specific frame sizes', () => {
    expect(isValidPacketSize(PackType.SYNTHESIZE, 156)).toBe(true);
    expect(isValidPacketSize(PackType.WAVE, 126)).toBe(true);
    expect(isValidPacketSize(PackType.WAVE, 206)).toBe(true);
    expect(isValidPacketSize(PackType.WAVE, 6)).toBe(false);
    expect(isValidPacketSize(0xFF, 6)).toBe(false);
  });
});
