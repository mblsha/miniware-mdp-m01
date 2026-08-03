import {
  decodePacket,
  processSynthesizePacket,
  type ChannelUpdate,
} from '../../webui/src/lib/packet-decoder';
import { createHeartbeatPacket } from '../../webui/src/lib/packet-encoder';
import { PackType } from './packet-types';

export type RequestConnection = {
  sendPacket: (packet: number[] | Uint8Array) => Promise<void>;
  waitForPacket: (packetType: number, timeoutMs?: number) => Promise<number[] | null>;
};

const DEFAULT_TELEMETRY_PROBE_INTERVAL_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertPositiveMilliseconds(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number`);
  }
}

export async function requestPacket(
  connection: RequestConnection,
  responseType: number,
  request: number[] | Uint8Array,
  timeoutMs: number
): Promise<number[] | null> {
  const response = connection.waitForPacket(responseType, timeoutMs);
  await connection.sendPacket(request);
  return response;
}

export async function requestSynthesizeChannels(
  connection: RequestConnection,
  timeoutMs = 2500,
  probeIntervalMs = DEFAULT_TELEMETRY_PROBE_INTERVAL_MS
): Promise<ChannelUpdate[] | null> {
  assertPositiveMilliseconds('Synthesize timeout', timeoutMs);
  assertPositiveMilliseconds('Synthesize probe interval', probeIntervalMs);

  // HEARTBEAT has no direct response in M01 v2.02. Every valid host frame
  // advances a shared scheduler by 20 and SYNTHESIZE is emitted only at a
  // scheduler phase divisible by 200. Install one waiter, then send separate,
  // paced heartbeat frames until scheduled telemetry arrives or it times out.
  const pendingPacket = connection.waitForPacket(PackType.SYNTHESIZE, timeoutMs);
  let packet: number[] | null = null;
  while (packet === null) {
    await connection.sendPacket(createHeartbeatPacket());
    const outcome = await Promise.race([
      pendingPacket.then((value) => ({ complete: true as const, value })),
      delay(probeIntervalMs).then(() => ({ complete: false as const, value: null })),
    ]);
    if (outcome.complete) {
      packet = outcome.value;
      break;
    }
  }
  if (!packet) return null;

  const decoded = decodePacket(packet);
  if (!decoded) return null;

  const processed = processSynthesizePacket(decoded);
  return processed && processed.length > 0 ? processed : null;
}

export async function requestSynthesizeChannelsWithRetry(
  connection: RequestConnection,
  timeoutMs = 2500,
  attempts = 3,
  probeIntervalMs = DEFAULT_TELEMETRY_PROBE_INTERVAL_MS
): Promise<ChannelUpdate[] | null> {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError('Synthesize request attempts must be a positive integer');
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const channels = await requestSynthesizeChannels(connection, timeoutMs, probeIntervalMs);
    if (channels) {
      return channels;
    }
  }

  return null;
}

export async function requestChannelStatus(
  connection: RequestConnection,
  channel: number,
  timeoutMs = 5000,
  probeIntervalMs = DEFAULT_TELEMETRY_PROBE_INTERVAL_MS
): Promise<ChannelUpdate | null> {
  if (!Number.isInteger(channel) || channel < 0 || channel > 5) {
    throw new RangeError('Channel must be an integer between 0 and 5');
  }
  const processed = await requestSynthesizeChannels(connection, timeoutMs, probeIntervalMs);
  if (!processed) return null;
  return processed.find((entry) => entry.channel === channel) ?? null;
}
