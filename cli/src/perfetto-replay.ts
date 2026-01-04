import { readFileSync } from 'node:fs';
import { perfetto } from '../../third_party/retrobus-perfetto/ts/src/proto/perfetto_pb.js';

export type ReplayChunk = {
  timestampNs: number;
  bytes: Uint8Array;
};

function parseHexBytes(hex: string): Uint8Array {
  const trimmed = hex.trim();
  if (!trimmed) return new Uint8Array();
  const parts = trimmed.split(/\s+/);
  const bytes = new Uint8Array(parts.length);
  for (let i = 0; i < parts.length; i += 1) {
    bytes[i] = Number.parseInt(parts[i], 16);
  }
  return bytes;
}

export function loadReplayChunks(tracePath: string): ReplayChunk[] {
  const data = readFileSync(tracePath);
  const trace = perfetto.protos.Trace.decode(data);
  const chunks: ReplayChunk[] = [];

  for (const packet of trace.packet ?? []) {
    const event = packet.trackEvent;
    if (!event || event.name !== 'rx_chunk') continue;
    const timestamp = packet.timestamp ?? 0;
    let hex: string | null = null;
    for (const annotation of event.debugAnnotations ?? []) {
      if (annotation.name === 'hex' && typeof annotation.stringValue === 'string') {
        hex = annotation.stringValue;
        break;
      }
    }
    if (!hex) continue;
    chunks.push({
      timestampNs: Number(timestamp),
      bytes: parseHexBytes(hex)
    });
  }

  chunks.sort((a, b) => a.timestampNs - b.timestampNs);
  return chunks;
}
