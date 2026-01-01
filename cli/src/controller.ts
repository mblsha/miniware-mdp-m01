import type {
  createGetMachinePacket as CreateGetMachinePacket,
  createHeartbeatPacket as CreateHeartbeatPacket,
  createSetChannelPacket as CreateSetChannelPacket,
  createSetCurrentPacket as CreateSetCurrentPacket,
  createSetOutputPacket as CreateSetOutputPacket,
  createSetVoltagePacket as CreateSetVoltagePacket,
  decodePacket as DecodePacket,
  processMachinePacket as ProcessMachinePacket,
  processSynthesizePacket as ProcessSynthesizePacket,
  PackType as PackTypeEnum,
  type ChannelUpdate
} from '../../packages/mdp-core/src/protocol';
import type { Transport } from '../../packages/mdp-core/src/transport';
import { delay } from './utils';

const STATUS_TIMEOUT_MS = 5000;
type ProtocolPackType = Pick<
  typeof PackTypeEnum,
  'SYNTHESIZE' | 'MACHINE' | 'SET_CH' | 'SET_V' | 'SET_I' | 'SET_ISOUTPUT'
>;
type ProtocolModule = {
  createGetMachinePacket: typeof CreateGetMachinePacket;
  createHeartbeatPacket: typeof CreateHeartbeatPacket;
  createSetChannelPacket: typeof CreateSetChannelPacket;
  createSetCurrentPacket: typeof CreateSetCurrentPacket;
  createSetOutputPacket: typeof CreateSetOutputPacket;
  createSetVoltagePacket: typeof CreateSetVoltagePacket;
  decodePacket: typeof DecodePacket;
  processMachinePacket: typeof ProcessMachinePacket;
  processSynthesizePacket: typeof ProcessSynthesizePacket;
  PackType: ProtocolPackType;
};
let cachedProtocol: Promise<ProtocolModule> | null = null;

async function getProtocol(overrides?: ProtocolModule): Promise<ProtocolModule> {
  if (overrides) {
    return overrides;
  }
  if (!cachedProtocol) {
    cachedProtocol = import('../../packages/mdp-core/src/protocol') as Promise<ProtocolModule>;
  }
  return cachedProtocol;
}

export async function waitForChannelStatus(
  transport: Transport,
  channel: number,
  timeoutMs = STATUS_TIMEOUT_MS,
  protocol?: ProtocolModule
): Promise<ChannelUpdate | null> {
  const {
    PackType,
    decodePacket,
    processSynthesizePacket
  } = await getProtocol(protocol);
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
  timeoutMs = 2500,
  protocol?: ProtocolModule
): Promise<string | null> {
  const {
    createHeartbeatPacket,
    PackType,
    decodePacket,
    processSynthesizePacket
  } = await getProtocol(protocol);

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
  baseline?: ChannelUpdate,
  protocol?: ProtocolModule
): Promise<void> {
  const {
    createSetChannelPacket,
    createSetVoltagePacket,
    createSetCurrentPacket
  } = await getProtocol(protocol);

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
  state: 'on' | 'off',
  protocol?: ProtocolModule
): Promise<void> {
  const { createSetChannelPacket, createSetOutputPacket } = await getProtocol(protocol);
  await transport.sendPacket(createSetChannelPacket(channel));
  await delay(50);
  await transport.sendPacket(createSetOutputPacket(channel, state === 'on'));
  await delay(50);
}

export async function fetchMachineInfo(
  transport: Transport,
  timeoutMs = 2500,
  protocol?: ProtocolModule
): Promise<ReturnType<typeof ProcessMachinePacket> | null> {
  const {
    createGetMachinePacket,
    PackType,
    decodePacket,
    processMachinePacket
  } = await getProtocol(protocol);
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
