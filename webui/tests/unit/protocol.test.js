import { describe, expect, it } from 'vitest';
import {
  assertHostCommandPacket,
  extractProtocolPackets,
  isValidPacketSize,
  PackType,
  validateProtocolPacket,
} from '$lib/protocol.js';

const machinePacket = (machineType = 0x10) => [
  0x5A, 0x5A, PackType.MACHINE, 7, 0xEE, machineType, machineType,
];

const updateChannelPacket = (channel) => [
  0x5A, 0x5A, PackType.UPDAT_CH, 7, channel, channel, channel,
];

const wavePacket = () => [
  0x5A, 0x5A, PackType.WAVE, 126, 0, 0,
  ...new Array(120).fill(0),
];

describe('protocol framing', () => {
  it('rejects zero-sized frames and recovers to the next valid device packet', () => {
    const malformed = [0x5A, 0x5A, PackType.MACHINE, 0, 0, 0];
    const machine = machinePacket();

    const result = extractProtocolPackets(Uint8Array.from([...malformed, ...machine]));

    expect(result.packets).toEqual([machine]);
    expect(result.remainder).toHaveLength(0);
  });

  it('reassembles a maximum-size frame across every possible split point', () => {
    const wave = wavePacket();
    for (let split = 1; split < wave.length; split += 1) {
      const first = extractProtocolPackets(Uint8Array.from(wave.slice(0, split)));
      expect(first.packets, `split ${split}`).toHaveLength(0);

      const second = extractProtocolPackets(Uint8Array.from([
        ...first.remainder,
        ...wave.slice(split),
      ]));
      expect(second.packets, `split ${split}`).toEqual([wave]);
      expect(second.remainder, `split ${split}`).toHaveLength(0);
    }
  });

  it('extracts several coalesced device frames in order', () => {
    const packets = [machinePacket(), updateChannelPacket(5), wavePacket()];
    const result = extractProtocolPackets(Uint8Array.from(packets.flat()));

    expect(result.packets).toEqual(packets);
    expect(result.remainder).toHaveLength(0);
  });

  it('skips a bad-checksum frame and resynchronizes to the next frame', () => {
    const corrupt = machinePacket();
    corrupt[5] ^= 0xFF;
    const valid = updateChannelPacket(2);

    const result = extractProtocolPackets(Uint8Array.from([...corrupt, ...valid]));
    expect(result.packets).toEqual([valid]);
    expect(result.frames).toEqual([
      expect.objectContaining({ packet: corrupt, accepted: false }),
      { packet: valid, accepted: true },
    ]);
  });

  it('does not let a plausible incomplete false header hide a later complete frame', () => {
    const falseWaveHeader = [0x5A, 0x5A, PackType.WAVE, 206, 0, 0];
    const machine = machinePacket(0x11);

    const result = extractProtocolPackets(Uint8Array.from([
      ...falseWaveHeader,
      1, 2, 3,
      ...machine,
    ]));

    expect(result.packets).toEqual([machine]);
    expect(result.remainder).toHaveLength(0);
  });

  it('retains only a trailing possible magic byte', () => {
    const result = extractProtocolPackets(Uint8Array.from([1, 2, 3, 0x5A]));
    expect(result.packets).toHaveLength(0);
    expect(Array.from(result.remainder)).toEqual([0x5A]);
  });

  it('rejects echoed host commands from the device receive stream', () => {
    const heartbeat = [0x5A, 0x5A, PackType.HEARTBEAT, 6, 0xEE, 0];
    const machine = machinePacket();
    const result = extractProtocolPackets(Uint8Array.from([...heartbeat, ...machine]));

    expect(result.packets).toEqual([machine]);
  });

  it('validates direction-specific sizes and channels', () => {
    expect(isValidPacketSize(PackType.SYNTHESIZE, 156, 'device-to-host')).toBe(true);
    expect(isValidPacketSize(PackType.WAVE, 126, 'device-to-host')).toBe(true);
    expect(isValidPacketSize(PackType.WAVE, 206, 'device-to-host')).toBe(true);
    expect(isValidPacketSize(PackType.WAVE, 6, 'device-to-host')).toBe(false);
    expect(isValidPacketSize(PackType.HEARTBEAT, 6, 'device-to-host')).toBe(false);
    expect(isValidPacketSize(PackType.HEARTBEAT, 6, 'host-to-device')).toBe(true);
    expect(isValidPacketSize(0xFF, 6)).toBe(false);
  });

  it('rejects malformed, concatenated, and unsafe outbound commands', () => {
    const outputOn = [0x5A, 0x5A, PackType.SET_ISOUTPUT, 7, 3, 1, 1];
    expect(validateProtocolPacket(outputOn, 'host-to-device').ok).toBe(true);
    expect(() => assertHostCommandPacket(outputOn)).not.toThrow();

    expect(() => assertHostCommandPacket([...outputOn, ...outputOn])).toThrow(
      'Declared packet size'
    );
    expect(() => assertHostCommandPacket([...outputOn.slice(0, 6)])).toThrow(
      'Declared packet size'
    );

    const broadcastOutput = [...outputOn];
    broadcastOutput[4] = 0xEE;
    expect(() => assertHostCommandPacket(broadcastOutput)).toThrow('requires channel 0-5');
  });

  it('requires UPDATE_CH header and payload channels to agree', () => {
    const mismatched = updateChannelPacket(2);
    mismatched[6] = 3;
    mismatched[5] = 3;
    expect(validateProtocolPacket(mismatched, 'device-to-host')).toEqual({
      ok: false,
      reason: 'UPDATE_CH header and payload channels must match',
    });
  });
});
