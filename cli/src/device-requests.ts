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
  timeoutMs = 2500
): Promise<ChannelUpdate[] | null> {
  const packet = await requestPacket(
    connection,
    PackType.SYNTHESIZE,
    createHeartbeatPacket(),
    timeoutMs
  );
  if (!packet) return null;

  const decoded = decodePacket(packet);
  if (!decoded) return null;

  const processed = processSynthesizePacket(decoded);
  return processed && processed.length > 0 ? processed : null;
}

export async function requestChannelStatus(
  connection: RequestConnection,
  channel: number,
  timeoutMs = 5000
): Promise<ChannelUpdate | null> {
  const processed = await requestSynthesizeChannels(connection, timeoutMs);
  if (!processed) return null;
  return processed.find((entry) => entry.channel === channel) ?? null;
}
