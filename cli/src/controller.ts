import {
  createGetMachinePacket,
  createHeartbeatPacket,
  createSetChannelPacket,
  createSetCurrentPacket,
  createSetOutputPacket,
  createSetVoltagePacket,
  decodePacket,
  processMachinePacket,
  processSynthesizePacket,
  PackType,
  type ChannelUpdate
} from '../../packages/mdp-core/src/protocol';
import type { Transport } from '../../packages/mdp-core/src/transport';
import { delay } from './utils';

const STATUS_TIMEOUT_MS = 5000;

export async function waitForChannelStatus(
  transport: Transport,
  channel: number,
  timeoutMs = STATUS_TIMEOUT_MS
): Promise<ChannelUpdate | null> {
  const packet = await transport.waitForPacket(PackType.SYNTHESIZE, timeoutMs);
  if (!packet) {
    return null;
  }

  const decoded = decodePacket(packet);
  if (!decoded) {
    return null;
  }

  const processed = processSynthesizePacket(decoded);
  if (!processed || processed.length === 0) {
    return null;
  }

  return processed[channel] ?? processed[0];
}

export async function detectMachineTypeFromSynthesize(
  transport: Transport,
  timeoutMs = 2500
): Promise<string | null> {
  try {
    await transport.sendPacket(createHeartbeatPacket());
  } catch {
    // ignore failures during detection
  }

  const packet = await transport.waitForPacket(PackType.SYNTHESIZE, timeoutMs);
  if (!packet) {
    return null;
  }

  const decoded = decodePacket(packet);
  if (!decoded) {
    return null;
  }

  const processed = processSynthesizePacket(decoded);
  if (!processed || processed.length === 0) {
    return null;
  }

  return processed[0].machineType;
}

export async function setTargets(
  transport: Transport,
  channel: number,
  parsedVoltage?: number,
  parsedCurrent?: number,
  baseline?: ChannelUpdate
): Promise<void> {
  if (parsedVoltage !== undefined) {
    const currentTarget =
      parsedCurrent ?? baseline?.targetCurrent ?? baseline?.current ?? 0;
    await transport.sendPacket(createSetChannelPacket(channel));
    await delay(50);
    await transport.sendPacket(createSetVoltagePacket(channel, parsedVoltage, currentTarget));
    await delay(50);
  }

  if (parsedCurrent !== undefined) {
    const voltageTarget =
      parsedVoltage ?? baseline?.targetVoltage ?? baseline?.voltage ?? 0;
    await transport.sendPacket(createSetChannelPacket(channel));
    await delay(50);
    await transport.sendPacket(createSetCurrentPacket(channel, voltageTarget, parsedCurrent));
    await delay(50);
  }
}

export async function setOutputState(
  transport: Transport,
  channel: number,
  state: 'on' | 'off'
): Promise<void> {
  await transport.sendPacket(createSetChannelPacket(channel));
  await delay(50);
  await transport.sendPacket(createSetOutputPacket(channel, state === 'on'));
  await delay(50);
}

export async function fetchMachineInfo(
  transport: Transport,
  timeoutMs = 2500
): Promise<ReturnType<typeof processMachinePacket> | null> {
  try {
    await transport.sendPacket(createGetMachinePacket());
  } catch {
    return null;
  }
  const response = await transport.waitForPacket(PackType.MACHINE, timeoutMs);
  if (!response) {
    return null;
  }
  const decoded = decodePacket(response);
  return decoded ? processMachinePacket(decoded) : null;
}
