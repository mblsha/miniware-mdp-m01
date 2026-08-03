import { describe, expect, it, vi } from 'vitest';
import { ReplaySerialConnection } from '../src/replay-serial';
import { PackType } from '../src/packet-types';

function machinePacket(machineType = 0x10): number[] {
  return [0x5A, 0x5A, PackType.MACHINE, 7, 0xEE, machineType, machineType];
}

function wavePacket(): number[] {
  return [0x5A, 0x5A, PackType.WAVE, 126, 0, 0, ...new Array(120).fill(0)];
}

describe('ReplaySerialConnection protocol stream', () => {
  it('reassembles a large frame split at every byte boundary', () => {
    const frame = wavePacket();

    for (let split = 1; split < frame.length; split += 1) {
      const connection = new ReplaySerialConnection();
      const handler = vi.fn();
      connection.registerPacketHandler(PackType.WAVE, handler);

      connection.ingestChunk(Uint8Array.from(frame.slice(0, split)));
      expect(handler, `split ${split}`).not.toHaveBeenCalled();
      connection.ingestChunk(Uint8Array.from(frame.slice(split)));
      expect(handler, `split ${split}`).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0], `split ${split}`).toEqual(frame);
    }
  });

  it('drops wrong-direction and corrupt frames while preserving the next response', () => {
    const connection = new ReplaySerialConnection();
    const observer = vi.fn();
    const machineHandler = vi.fn();
    connection.registerPacketObserver(observer);
    connection.registerPacketHandler(PackType.MACHINE, machineHandler);

    const heartbeat = [0x5A, 0x5A, PackType.HEARTBEAT, 6, 0xEE, 0];
    const corrupt = machinePacket();
    corrupt[5] ^= 0xFF;
    const valid = machinePacket(0x11);

    connection.ingestChunk(Uint8Array.from([
      ...heartbeat,
      ...corrupt,
      ...valid,
    ]));

    // Observers retain complete candidates for capture diagnostics, including
    // direction and checksum failures. Typed handlers see validated input only.
    expect(observer.mock.calls.map(([packet]) => packet)).toEqual([
      heartbeat,
      corrupt,
      valid,
    ]);
    expect(machineHandler).toHaveBeenCalledOnce();
    expect(machineHandler).toHaveBeenCalledWith(valid);
  });
});
