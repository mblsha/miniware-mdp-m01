// Core types for the MDP Web UI
export type { Channel, WaveformPoint, DeviceInfo, DeviceType } from '@mdp-core/protocol/types';
export type { SerialConfig, PacketHandler } from '@mdp-core/transport';
export { ConnectionStatus } from '@mdp-core/protocol/types';
export { PackType } from '@mdp-core/protocol';

export type { DecodedPacket as Packet, SynthesizePacket, WavePacket, AddressPacket, MachinePacket, UpdateChannelPacket } from '@mdp-core/protocol';
export type { SparklineDataPoint } from '@mdp-core/protocol/types';

export interface SparklineOptions {
  channel: number;
  metric: 'voltage' | 'current' | 'power';
  targetValue?: number;
  width?: number;
  height?: number;
  showAxes?: boolean;
  showTooltip?: boolean;
}

// Store types
export interface StoreState<T> {
  subscribe: (run: (value: T) => void) => () => void;
  set: (value: T) => void;
  update: (updater: (value: T) => T) => void;
}

export interface DerivedStoreState<T> {
  subscribe: (run: (value: T) => void) => () => void;
}
