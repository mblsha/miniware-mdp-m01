import { isWavePacket, type DecodedPacket } from './packet-decoder';

type DeviceWaveSample = {
  deviceTimeUs: number;
  voltage: number;
  current: number;
};

export type WaveSample = {
  timeSeconds: number;
  voltage: number;
  current: number;
};

type QueuedPacket = {
  hostNs: number;
  deviceStartUs: number;
  deviceEndUs: number;
  samples: DeviceWaveSample[];
};

type Mapping = {
  scale: number;
  offsetNs: number;
};

function extractWaveSamples(
  packet: DecodedPacket,
  runningTimeUs: number
): { samples: DeviceWaveSample[]; nextDeviceTimeUs: number } | null {
  if (!isWavePacket(packet)) return null;

  const wave = packet.data;
  const samples: DeviceWaveSample[] = [];
  const samplesPerGroup = packet.size === 126 ? 2 : packet.size === 206 ? 4 : 0;

  wave.groups.forEach((group) => {
    const groupElapsedTimeUs = group.timestamp / 10;
    const pointsInGroup = samplesPerGroup || group.items.length || 1;
    const timePerSampleUs = pointsInGroup > 0 ? groupElapsedTimeUs / pointsInGroup : 0;

    for (let i = 0; i < pointsInGroup; i++) {
      const item = group.items[i];
      if (!item) break;
      const sampleTimeUs = runningTimeUs + i * timePerSampleUs;
      samples.push({
        deviceTimeUs: sampleTimeUs,
        voltage: item.voltage,
        current: item.current
      });
    }

    runningTimeUs += groupElapsedTimeUs;
  });

  return { samples, nextDeviceTimeUs: runningTimeUs };
}

export class WaveTimestampReconciler {
  private readonly delayNs: number;
  private readonly tailNs: number;
  private readonly buffer: QueuedPacket[] = [];
  private deviceCursorUs = 0;
  private lastEmittedNs = 0;
  private lastMapping: Mapping | null = null;

  constructor(delayNs: number, tailNs: number) {
    this.delayNs = delayNs;
    this.tailNs = tailNs;
  }

  pushPacket(packet: DecodedPacket, hostNs: number): WaveSample[] {
    const extracted = extractWaveSamples(packet, this.deviceCursorUs);
    if (!extracted) return [];

    const { samples, nextDeviceTimeUs } = extracted;
    const queued: QueuedPacket = {
      hostNs,
      deviceStartUs: this.deviceCursorUs,
      deviceEndUs: nextDeviceTimeUs,
      samples
    };

    this.deviceCursorUs = nextDeviceTimeUs;
    this.buffer.push(queued);

    return this.flush(false);
  }

  flushAll(): WaveSample[] {
    return this.flush(true);
  }

  getLastEmittedNs(): number {
    return this.lastEmittedNs;
  }

  private flush(flushAll: boolean): WaveSample[] {
    if (this.buffer.length === 0) {
      return [];
    }

    const mapping = this.computeMapping(flushAll);
    if (!mapping) {
      return [];
    }

    const cutoffHostNs = flushAll
      ? Number.POSITIVE_INFINITY
      : this.buffer[this.buffer.length - 1].hostNs - this.tailNs;

    const output: WaveSample[] = [];
    while (this.buffer.length > 0 && this.buffer[0].hostNs <= cutoffHostNs) {
      const packet = this.buffer.shift();
      if (!packet) break;
      for (const sample of packet.samples) {
        const adjustedNs = mapping.offsetNs + mapping.scale * sample.deviceTimeUs * 1000;
        const monotonicNs = Math.max(adjustedNs, this.lastEmittedNs);
        this.lastEmittedNs = monotonicNs;
        output.push({
          timeSeconds: monotonicNs / 1_000_000_000,
          voltage: sample.voltage,
          current: sample.current
        });
      }
    }

    return output;
  }

  private computeMapping(flushAll: boolean): Mapping | null {
    if (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const last = this.buffer[this.buffer.length - 1];
      const hostSpanNs = last.hostNs - first.hostNs;
      const deviceSpanUs = last.deviceEndUs - first.deviceStartUs;

      const minSpanNs = flushAll ? 1 : this.delayNs;
      if (hostSpanNs >= minSpanNs && deviceSpanUs > 0) {
        const scale = hostSpanNs / (deviceSpanUs * 1000);
        const offsetNs = first.hostNs - scale * first.deviceStartUs * 1000;
        this.lastMapping = { scale, offsetNs };
        return this.lastMapping;
      }
    }

    if (flushAll) {
      if (this.lastMapping) {
        return this.lastMapping;
      }

      if (this.buffer.length > 0) {
        const first = this.buffer[0];
        const scale = 1;
        const offsetNs = first.hostNs - scale * first.deviceStartUs * 1000;
        this.lastMapping = { scale, offsetNs };
        return this.lastMapping;
      }
    }

    return null;
  }
}
