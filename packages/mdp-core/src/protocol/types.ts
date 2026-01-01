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
  psuStatus?: string;
  recording?: boolean;
  waveformData?: WaveformPoint[];
  runningTimeUs?: number;
}

export interface WaveformPoint {
  timestamp: number;
  voltage: number;
  current: number;
}

export type DeviceType = 'M01' | 'M02';

export interface DeviceInfo {
  type: DeviceType;
  hasLCD: boolean;
}

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

export interface SparklineDataPoint {
  timestamp: number;
  value: number;
}
