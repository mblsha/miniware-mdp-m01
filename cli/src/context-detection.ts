import type { ChannelUpdate } from '../../webui/src/lib/packet-decoder';
import { categorizeDevice, type DeviceCategory, type DeviceContextParams } from './context-registry';

export function isRealMachineType(value?: string): boolean {
  if (!value) return false;
  const normalized = value.trim();
  return !normalized.startsWith('Unknown') && normalized !== 'Node';
}

export function isLoadMachineType(value?: string): boolean {
  return (value ?? '').toLowerCase().includes('l1060');
}

export function isPsuMachineType(value?: string): boolean {
  return isRealMachineType(value) && !isLoadMachineType(value);
}

export function selectMachineTypeFromChannels(channels: ChannelUpdate[]): string | null {
  if (channels.length === 0) {
    return null;
  }

  const candidates = channels.filter((channel) => isRealMachineType(channel.machineType));
  if (candidates.length === 0) {
    return null;
  }
  const onlineCandidates = candidates.filter((channel) => channel.online);
  const search = onlineCandidates.length > 0 ? onlineCandidates : candidates;
  const loadMatch = search.find((channel) => isLoadMachineType(channel.machineType));

  if (loadMatch?.machineType) {
    return loadMatch.machineType;
  }

  if (search.length > 0) {
    return search[0].machineType ?? null;
  }

  const onlineFallback = channels.filter((channel) => channel.online);
  if (onlineFallback.length > 0) {
    return onlineFallback[0].machineType ?? null;
  }

  return channels[0].machineType ?? null;
}

export function selectChannelFromChannels(
  channels: ChannelUpdate[],
  category: DeviceCategory
): ChannelUpdate | null {
  if (channels.length === 0) {
    return null;
  }

  const online = channels.filter((channel) => channel.online);
  if (category === 'load') {
    const loadOnline = online.find((channel) => isLoadMachineType(channel.machineType));
    if (loadOnline) {
      return loadOnline;
    }

    const loadAny = channels.find((channel) => isLoadMachineType(channel.machineType));
    if (loadAny) {
      return loadAny;
    }
  } else {
    const psuOnline = online.filter((channel) => isPsuMachineType(channel.machineType));
    if (psuOnline.length > 0) {
      return psuOnline[0];
    }

    const psuAny = channels.filter((channel) => isPsuMachineType(channel.machineType));
    if (psuAny.length > 0) {
      return psuAny[0];
    }
  }

  const realOnline = online.filter((channel) => isRealMachineType(channel.machineType));
  if (realOnline.length > 0) {
    return realOnline[0];
  }

  if (online.length > 0) {
    return online[0];
  }

  const realAny = channels.filter((channel) => isRealMachineType(channel.machineType));
  if (realAny.length > 0) {
    return realAny[0];
  }

  return channels[0];
}

export function buildContextsFromChannels(
  portPath: string,
  channels: ChannelUpdate[]
): DeviceContextParams[] {
  return channels
    .filter((channel) => channel.online && isRealMachineType(channel.machineType))
    .map((channel) => ({
      portPath,
      category: categorizeDevice(channel.machineType ?? 'Unknown'),
      machineType: channel.machineType ?? 'Unknown',
      channel: channel.channel
    }));
}
