import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadReplayChunks } from '../src/perfetto-replay';
import { ReplaySerialConnection } from '../src/replay-serial';
import { PackType } from '../src/packet-types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tracePath = resolve(__dirname, '../../reference-data/recording_1h.perfetto-trace');

const DEFAULT_WAVE_GAP_NS = 1_000_000_000;
const DEVICE_LIMITS = {
  maxVoltage: 30,
  maxCurrent: 10,
  maxPower: 300
};

type AlertCounts = {
  checksum_failed: number;
  delta_t_oos: number;
  voltage_oos: number;
  current_oos: number;
  power_oos: number;
};

function validateChecksum(packet: number[]): { ok: boolean } | null {
  if (packet.length < 6) return null;
  if (packet[0] !== 0x5a || packet[1] !== 0x5a) return null;
  const size = packet[3];
  if (size < 6 || packet.length !== size) return null;
  let checksum = 0;
  for (let i = 6; i < packet.length; i += 1) {
    checksum ^= packet[i];
  }
  return { ok: checksum === packet[5] };
}

function parseWaveSamples(packet: number[]): Array<{ voltage: number; current: number }> {
  const size = packet[3];
  const samplesPerGroup = size === 126 ? 2 : size === 206 ? 4 : 0;
  if (samplesPerGroup === 0) return [];

  const samples: Array<{ voltage: number; current: number }> = [];
  let idx = 6;
  for (let group = 0; group < 10; group += 1) {
    if (idx + 4 > packet.length) break;
    idx += 4; // timestamp
    for (let i = 0; i < samplesPerGroup; i += 1) {
      if (idx + 4 > packet.length) break;
      const voltageMv = packet[idx] | (packet[idx + 1] << 8);
      const currentMa = packet[idx + 2] | (packet[idx + 3] << 8);
      idx += 4;
      samples.push({
        voltage: voltageMv / 1000,
        current: currentMa / 1000
      });
    }
  }
  return samples;
}

describe('perfetto replay alert counts', () => {
  it('matches expected alerts produced during replay', () => {
    const chunks = loadReplayChunks(tracePath);
    const connection = new ReplaySerialConnection();
    const alerts: AlertCounts = {
      checksum_failed: 0,
      delta_t_oos: 0,
      voltage_oos: 0,
      current_oos: 0,
      power_oos: 0
    };
    let nowNs = 0;
    let lastWavePacketNs: number | null = null;

    connection.registerPacketObserver((packet) => {
      const validation = validateChecksum(packet);
      if (!validation) return;
      if (!validation.ok) {
        alerts.checksum_failed += 1;
      }
    });

    connection.registerPacketHandler(PackType.WAVE, (packet) => {
      const validation = validateChecksum(packet);
      if (!validation || !validation.ok) return;

      if (lastWavePacketNs !== null) {
        const deltaNs = nowNs - lastWavePacketNs;
        if (deltaNs > DEFAULT_WAVE_GAP_NS) {
          alerts.delta_t_oos += 1;
        }
      }
      lastWavePacketNs = nowNs;

      for (const sample of parseWaveSamples(packet)) {
        if (sample.voltage > DEVICE_LIMITS.maxVoltage) {
          alerts.voltage_oos += 1;
        }
        if (sample.current > DEVICE_LIMITS.maxCurrent) {
          alerts.current_oos += 1;
        }
        const power = sample.voltage * sample.current;
        if (power > DEVICE_LIMITS.maxPower) {
          alerts.power_oos += 1;
        }
      }
    });

    for (const chunk of chunks) {
      nowNs = chunk.timestampNs;
      connection.ingestChunk(chunk.bytes);
    }

    expect(alerts).toEqual({
      checksum_failed: 110,
      delta_t_oos: 8,
      voltage_oos: 0,
      current_oos: 0,
      power_oos: 0
    });
  });
});
