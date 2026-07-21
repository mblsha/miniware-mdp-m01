// Core types for the MDP Web UI

export interface Channel {
  channel: number;
  online: boolean;
  machineType: string;
  voltage: number;
  current: number;
  power: number;
  temperature: number;
  isOutput: boolean;
  mode: string;
  address: number[];
  targetVoltage: number;
  targetCurrent: number;
  targetPower: number;
  inputVoltage?: number;
  inputCurrent?: number;
  inputPower?: number;
  recording?: boolean;
  waveformData?: WaveformPoint[];
  runningTimeUs?: number;
}

export interface WaveformPoint {
  timestamp: number;
  voltage: number;
  current: number;
}

export interface SerialConfig {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd';
  flowControl: 'none' | 'hardware';
}

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

export { PackType } from '../protocol';

export interface Packet {
  packType: number;
  size: number;
  channel?: number;
  checksum?: number;
  data: unknown;
}

export interface SparklineDataPoint {
  timestamp: number;
  value: number;
}

export interface SparklineOptions {
  channel: number;
  metric: 'voltage' | 'current' | 'power';
  targetValue?: number;
  width?: number;
  height?: number;
  showAxes?: boolean;
  showTooltip?: boolean;
}

export type PacketHandler = (packet: number[]) => void;
export type RawDataHandler = (chunk: Uint8Array) => void;

// Store types
export interface StoreState<T> {
  subscribe: (run: (value: T) => void) => () => void;
  set: (value: T) => void;
  update: (updater: (value: T) => T) => void;
}

export interface DerivedStoreState<T> {
  subscribe: (run: (value: T) => void) => () => void;
}
