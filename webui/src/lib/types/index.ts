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

export enum PackType {
  SYNTHESIZE = 0x11,
  WAVE = 0x12,
  ADDR = 0x13,
  UPDAT_CH = 0x14,
  MACHINE = 0x15,
  ERR_240 = 0x23,
  SET_ISOUTPUT = 0x16,
  SET_CH = 0x19,
  SET_V = 0x1A,
  SET_I = 0x1B,
  SET_ADDR = 0x18,
  SET_ALL_ADDR = 0x1C,
  RGB = 0x20,
  HEARTBEAT = 0x22,
  GET_ADDR = 0x17,
  GET_MACHINE = 0x21,
  RESET_TO_DFU = 0x1F,
  START_AUTO_MATCH = 0x1D,
  STOP_AUTO_MATCH = 0x1E
}

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

// Store types
export interface StoreState<T> {
  subscribe: (run: (value: T) => void) => () => void;
  set: (value: T) => void;
  update: (updater: (value: T) => T) => void;
}

export interface DerivedStoreState<T> {
  subscribe: (run: (value: T) => void) => () => void;
}
