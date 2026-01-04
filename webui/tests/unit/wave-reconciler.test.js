import { describe, it, expect } from 'vitest';
import { WaveTimestampReconciler } from '$lib/wave-reconciler.js';

function makeWavePacket(groupTimestamp, samples) {
  return {
    packType: 0x12,
    size: 126,
    data: {
      channel: 0,
      groups: [
        {
          timestamp: groupTimestamp,
          items: samples
        }
      ]
    }
  };
}

describe('WaveTimestampReconciler', () => {
  it('aligns device time to host time and emits monotonic samples', () => {
    const reconciler = new WaveTimestampReconciler(1, 0);
    const packet1 = makeWavePacket(1000, [
      { voltage: 1.0, current: 0.1 },
      { voltage: 1.1, current: 0.2 }
    ]);
    const packet2 = makeWavePacket(1000, [
      { voltage: 1.2, current: 0.3 },
      { voltage: 1.3, current: 0.4 }
    ]);

    const first = reconciler.pushPacket(packet1, 0);
    expect(first).toHaveLength(0);

    const second = reconciler.pushPacket(packet2, 1_000_000_000);
    expect(second).toHaveLength(4);
    expect(second.map((sample) => sample.timeSeconds)).toEqual([
      expect.closeTo(0, 6),
      expect.closeTo(0.25, 6),
      expect.closeTo(0.5, 6),
      expect.closeTo(0.75, 6)
    ]);
    expect(second.map((sample) => sample.voltage)).toEqual([1.0, 1.1, 1.2, 1.3]);
  });

  it('flushes remaining samples when only one packet is buffered', () => {
    const reconciler = new WaveTimestampReconciler(1_000_000_000, 0);
    const packet = makeWavePacket(1000, [
      { voltage: 2.0, current: 0.5 },
      { voltage: 2.1, current: 0.6 }
    ]);

    const initial = reconciler.pushPacket(packet, 500_000_000);
    expect(initial).toHaveLength(0);

    const flushed = reconciler.flushAll();
    expect(flushed).toHaveLength(2);
    expect(flushed[0].timeSeconds).toBeGreaterThanOrEqual(0);
  });
});
