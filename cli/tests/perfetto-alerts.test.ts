import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { perfetto } from '../../third_party/retrobus-perfetto/ts/src/proto/perfetto_pb.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tracePath = resolve(__dirname, '../../reference-data/recording_1h.perfetto-trace');

describe('perfetto alert counts', () => {
  it('matches expected alert classes for 1h capture', () => {
    const data = readFileSync(tracePath);
    const trace = perfetto.protos.Trace.decode(data);
    const counts = new Map<string, number>();

    for (const packet of trace.packet ?? []) {
      const event = packet.trackEvent;
      const name = event?.name;
      if (!name || !name.startsWith('alert:')) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    const getCount = (name: string) => counts.get(name) ?? 0;

    expect(getCount('alert:delta_t_oos')).toBe(8);
    expect(getCount('alert:current_oos')).toBe(5);
    expect(getCount('alert:power_oos')).toBe(3);
    expect(getCount('alert:voltage_oos')).toBe(1);
    expect(getCount('alert:checksum_failed')).toBe(0);

    const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(17);
  });
});
