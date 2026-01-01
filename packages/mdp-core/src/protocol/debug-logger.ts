// Debug logging utility for both CLI and shared protocol code
import { getMachineTypeString } from './machine-utils';
import type { DecodedPacket } from './packet-decoder';
import type {
  AddressData,
  MachineData,
  SynthesizeChannel,
  SynthesizeData,
  WaveData
} from './types/kaitai';

const PACKET_TYPE_NAMES: Record<number, string> = {
  17: 'SYNTHESIZE',
  18: 'WAVE',
  19: 'ADDR',
  20: 'UPDATE_CH',
  21: 'MACHINE',
  22: 'SET_ISOUTPUT',
  23: 'GET_ADDR',
  24: 'SET_ADDR',
  25: 'SET_CH',
  26: 'SET_V',
  27: 'SET_I',
  28: 'SET_ALL_ADDR',
  29: 'START_AUTO_MATCH',
  30: 'STOP_AUTO_MATCH',
  31: 'RESET_TO_DFU',
  32: 'RGB',
  33: 'GET_MACHINE',
  34: 'HEARTBEAT',
  35: 'ERR_240'
};

export function getPacketTypeName(typeNumber: number): string {
  return PACKET_TYPE_NAMES[typeNumber] || `UNKNOWN_${typeNumber}`;
}

export function getPacketTypeDisplay(typeNumber: number): string {
  const name = getPacketTypeName(typeNumber);
  const hex = '0x' + typeNumber.toString(16).padStart(2, '0').toUpperCase();
  return `${name} (${hex}/${typeNumber})`;
}

let currentDebugState = false;
type DebugSubscriber = (value: boolean) => void;
const subscribers = new Set<DebugSubscriber>();

function notifySubscribers(): void {
  subscribers.forEach((subscriber) => subscriber(currentDebugState));
}

export const debugEnabled = {
  set(value: boolean) {
    const booleanValue = Boolean(value);
    if (currentDebugState === booleanValue) {
      return;
    }
    currentDebugState = booleanValue;
    notifySubscribers();
  },
  subscribe(subscriber: DebugSubscriber) {
    subscriber(currentDebugState);
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
    };
  },
  get() {
    return currentDebugState;
  }
};

export function isDebugEnabled(): boolean {
  return currentDebugState;
}

type ConsoleLevel = 'log' | 'warn' | 'error';

function logWithLevel(level: ConsoleLevel, category: string, message: string, args: unknown[]): void {
  if (!currentDebugState) {
    return;
  }
  const prefix = getLogPrefix(category);
  console[level](prefix + message, ...args);
}

export function debugLog(category: string, message: string, ...args: unknown[]): void {
  logWithLevel('log', category, message, args);
}

export function debugWarn(category: string, message: string, ...args: unknown[]): void {
  logWithLevel('warn', category, message, args);
}

export function debugError(category: string, message: string, ...args: unknown[]): void {
  logWithLevel('error', category, message, args);
}

const LOG_PREFIXES: Readonly<Record<string, string>> = {
  'raw-serial': '🔴 RAW SERIAL: ',
  'packet-parse': '🔵 PACKET PARSE: ',
  'packet-handle': '🟢 PACKET HANDLE: ',
  'packet-register': '📋 PACKET REGISTER: ',
  'packet-decode': '🔧 PACKET DECODE: ',
  'synthesize': '⚙️ SYNTHESIZE: ',
  'channel-store': '📊 CHANNEL STORE: ',
  'packet-send': '📤 PACKET SEND: ',
  kaitai: '🔬 KAITAI: ',
  emergency: '🚨 EMERGENCY: '
};

function getLogPrefix(category: string): string {
  return LOG_PREFIXES[category] || '🔍 DEBUG: ';
}

export function logPacketData(category: string, packet: number[] | Uint8Array, decoded: DecodedPacket | null = null): void {
  if (!currentDebugState) return;
  if (!packet || packet.length < 3) {
    debugError(category, 'Invalid packet data');
    return;
  }
  const packetType = packet[2];
  const typeName = getPacketTypeDisplay(packetType);
  debugLog(category, `=== ${typeName} PACKET ===`);
  debugLog(category, `  Length: ${packet.length} bytes`);
  const packetArray = Array.from(packet);
  debugLog(
    category,
    `  Hex: ${packetArray
      .slice(0, Math.min(32, packet.length))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ')}${packet.length > 32 ? '...' : ''}`
  );
  if (decoded) {
    logDecodedKaitaiData(category, decoded);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSynthesizeData(data: unknown): data is SynthesizeData {
  return isRecord(data) && Array.isArray(data.channels);
}

function isWaveData(data: unknown): data is WaveData {
  return isRecord(data) && typeof data.channel === 'number' && Array.isArray(data.groups);
}

function isAddressData(data: unknown): data is AddressData {
  return isRecord(data) && Array.isArray(data.addresses);
}

function isMachineData(data: unknown): data is MachineData {
  return isRecord(data) && typeof data.machineTypeRaw === 'number';
}

function getDataObjectTypeName(data: unknown): string {
  if (!isRecord(data)) return 'Unknown';
  const ctor = (data as { constructor?: { name?: string } }).constructor;
  return ctor?.name || 'Unknown';
}

export function logDecodedKaitaiData(category: string, decoded: DecodedPacket): void {
  if (!currentDebugState) return;
  debugLog(category, '  📋 DECODED KAITAI DATA:');
  debugLog(category, `    Pack Type: ${getPacketTypeDisplay(decoded.packType)}`);
  debugLog(category, `    Data Object Type: ${getDataObjectTypeName(decoded.data)}`);
  if (!decoded.data) {
    return;
  }
  switch (decoded.packType) {
    case 17: // SYNTHESIZE
      if (isSynthesizeData(decoded.data)) {
        logSynthesizeData(category, decoded.data);
      } else {
        debugLog(category, `    Data: ${JSON.stringify(decoded.data, null, 2)}`);
      }
      break;
    case 18: // WAVE
      if (isWaveData(decoded.data)) {
        logWaveData(category, decoded.data);
      } else {
        debugLog(category, `    Data: ${JSON.stringify(decoded.data, null, 2)}`);
      }
      break;
    case 19: // ADDR
      if (isAddressData(decoded.data)) {
        logAddrData(category, decoded.data);
      } else {
        debugLog(category, `    Data: ${JSON.stringify(decoded.data, null, 2)}`);
      }
      break;
    case 21: // MACHINE
      if (isMachineData(decoded.data)) {
        logMachineData(category, decoded.data);
      } else {
        debugLog(category, `    Data: ${JSON.stringify(decoded.data, null, 2)}`);
      }
      break;
    default:
      debugLog(category, `    Data: ${JSON.stringify(decoded.data, null, 2)}`);
  }
}

function logSynthesizeData(category: string, data: SynthesizeData): void {
  debugLog(category, `    📡 SYNTHESIZE DATA:`);
  debugLog(category, `      Channels available: ${data.channels.length || 0}`);
  data.channels.forEach((ch: SynthesizeChannel, i: number) => {
    if (ch.online) {
      debugLog(category, `      🟢 Channel ${i}: ONLINE`);
      debugLog(category, `        🔋 Voltage: ${ch.outVoltage}V, Current: ${ch.outCurrent}A`);
      debugLog(category, `        🌡️ Temperature: ${ch.temperature}°C`);
      debugLog(category, `        ⚡ Output: ${ch.outputOn ? 'ON' : 'OFF'}`);
      debugLog(category, `        🏭 Machine Type: ${ch.type} (${getMachineTypeString(ch.type)})`);
    } else {
      debugLog(category, `      ⚫ Channel ${i}: OFFLINE`);
    }
  });
}

function logWaveData(category: string, data: WaveData): void {
  debugLog(category, `    📊 WAVE DATA:`);
  data.groups.forEach((group) => {
    debugLog(category, `      Timestamp: ${group.timestamp}`);
    group.items.forEach((item, index) => {
      debugLog(category, `        Item ${index}: ${item.voltage}V, ${item.current}A`);
    });
  });
}

function logAddrData(category: string, data: AddressData): void {
  debugLog(category, `    🗺️ ADDRESS DATA:`);
  data.addresses.forEach((entry, index) => {
    const bytes = 'address' in entry ? Array.from(entry.address) : [];
    debugLog(category, `      Channel ${index}: [${bytes.join(', ')}] freq offset ${entry.frequencyOffset}`);
  });
}

function logMachineData(category: string, data: MachineData): void {
  debugLog(category, `    🏭 MACHINE DATA: type ${getMachineTypeString(data.machineTypeRaw)} (${data.machineTypeRaw})`);
}
