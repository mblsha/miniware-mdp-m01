import { readFileSync } from 'node:fs';
import { perfetto } from '../../third_party/retrobus-perfetto/ts/src/proto/perfetto_pb.js';

const MAX_TRACE_BYTES = 256 * 1024 * 1024;
const MAX_REPLAY_CHUNKS = 1_000_000;
const MAX_CHUNK_BYTES = 1024 * 1024;

export type ReplayChunk = {
  timestampNs: number;
  bytes: Uint8Array;
};

function parseHexBytes(hex: string): Uint8Array {
  const trimmed = hex.trim();
  if (!trimmed) return new Uint8Array();
  const parts = trimmed.split(/\s+/);
  if (parts.length > MAX_CHUNK_BYTES) {
    throw new Error(`Replay chunk exceeds ${MAX_CHUNK_BYTES} bytes`);
  }
  const bytes = new Uint8Array(parts.length);
  for (let i = 0; i < parts.length; i += 1) {
    if (!/^[0-9a-fA-F]{2}$/.test(parts[i])) {
      throw new Error(`Invalid replay hex byte "${parts[i]}"`);
    }
    bytes[i] = Number.parseInt(parts[i], 16);
  }
  return bytes;
}

export function loadReplayChunks(tracePath: string): ReplayChunk[] {
  const data = readFileSync(tracePath);
  if (data.byteLength > MAX_TRACE_BYTES) {
    throw new Error(`Perfetto replay file exceeds ${MAX_TRACE_BYTES} bytes`);
  }
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
    if (chunks.length >= MAX_REPLAY_CHUNKS) {
      throw new Error(`Perfetto replay exceeds ${MAX_REPLAY_CHUNKS} chunks`);
    }
    const timestampNs = Number(timestamp);
    if (!Number.isSafeInteger(timestampNs) || timestampNs < 0) {
      throw new Error(`Replay timestamp is outside the safe integer range: ${String(timestamp)}`);
    }
    chunks.push({
      timestampNs,
      bytes: parseHexBytes(hex)
    });
  }

  chunks.sort((a, b) => a.timestampNs - b.timestampNs);
  return chunks;
}
