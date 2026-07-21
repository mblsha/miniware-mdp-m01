// Debug logging utility with conditional logging and human-readable packet names
import { writable } from 'svelte/store';
import { getMachineTypeString } from './machine-utils';
import type { DecodedPacket } from './packet-decoder';
import type { AddressData, AddressEntry, MachineData, SynthesizeChannel, SynthesizeData, WaveData } from './types/kaitai';
import { PackType } from './protocol';

// Debug logging enabled state
export const debugEnabled = writable(true); // Default enabled

// Packet type name mappings
export const PACKET_TYPE_NAMES = {
  [PackType.SYNTHESIZE]: 'SYNTHESIZE',
  [PackType.WAVE]: 'WAVE',
  [PackType.ADDR]: 'ADDR',
  [PackType.UPDAT_CH]: 'UPDATE_CH',
  [PackType.MACHINE]: 'MACHINE',
  [PackType.SET_ISOUTPUT]: 'SET_ISOUTPUT',
  [PackType.GET_ADDR]: 'GET_ADDR',
  [PackType.SET_ADDR]: 'SET_ADDR',
  [PackType.SET_CH]: 'SET_CH',
  [PackType.SET_V]: 'SET_V',
  [PackType.SET_I]: 'SET_I',
  [PackType.SET_ALL_ADDR]: 'SET_ALL_ADDR',
  [PackType.START_AUTO_MATCH]: 'START_AUTO_MATCH',
  [PackType.STOP_AUTO_MATCH]: 'STOP_AUTO_MATCH',
  [PackType.RESET_TO_DFU]: 'RESET_TO_DFU',
  [PackType.RGB]: 'RGB',
  [PackType.GET_MACHINE]: 'GET_MACHINE',
  [PackType.HEARTBEAT]: 'HEARTBEAT',
  [PackType.ERR_240]: 'ERR_240',
};

export function getPacketTypeName(typeNumber: number): string {
  return PACKET_TYPE_NAMES[typeNumber as keyof typeof PACKET_TYPE_NAMES] || `UNKNOWN_${typeNumber}`;
}

export function getPacketTypeDisplay(typeNumber: number): string {
  const name = getPacketTypeName(typeNumber);
  const hex = '0x' + typeNumber.toString(16).padStart(2, '0').toUpperCase();
  return `${name} (${hex}/${typeNumber})`;
}

// Enhanced logging functions that check debug state
let currentDebugState = true;

// Subscribe to debug state changes
debugEnabled.subscribe(value => {
  currentDebugState = value;
});

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
  'kaitai': '🔬 KAITAI: ',
  'emergency': '🚨 EMERGENCY: '
};

function getLogPrefix(category: string): string {
  return LOG_PREFIXES[category] || '🔍 DEBUG: ';
}

// Enhanced packet data logging
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
  debugLog(category, `  Hex: ${packetArray.slice(0, Math.min(32, packet.length)).map((b: number) => b.toString(16).padStart(2, '0')).join(' ')}${packet.length > 32 ? '...' : ''}`);
  
  if (decoded) {
    logDecodedKaitaiData(category, decoded);
  }
}

// Log detailed Kaitai decoded data
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
  
  if (decoded.data) {
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
  debugLog(category, `      Channel: ${data.channel}`);
  debugLog(category, `      Groups: ${data.groups.length || 0}`);
  
  if (data.groups.length > 0) {
    const firstGroup = data.groups[0];
    debugLog(category, `      First Group - Timestamp: ${firstGroup.timestamp}, Points: ${firstGroup.items?.length || 0}`);
    if (firstGroup.items && firstGroup.items.length > 0) {
      const firstPoint = firstGroup.items[0];
      debugLog(category, `        First Point: ${firstPoint.voltage}V, ${firstPoint.current}A`);
    }
  }
}

function formatAddressBytes(entry: AddressEntry): number[] {
  if ('address' in entry) return Array.from(entry.address);
  return [entry.addrByte4, entry.addrByte3, entry.addrByte2, entry.addrByte1, entry.addrByte0];
}

function logAddrData(category: string, data: AddressData): void {
  debugLog(category, `    📍 ADDRESS DATA:`);
  data.addresses.forEach((addr, i: number) => {
    const addressBytes = formatAddressBytes(addr).map((b: number) => b.toString(16).padStart(2, '0')).join(':');
    const frequency = 2400 + addr.frequencyOffset;
    debugLog(category, `      Channel ${i}: ${addressBytes} @ ${frequency}MHz`);
  });
}

function logMachineData(category: string, data: MachineData): void {
  debugLog(category, `    🏭 MACHINE DATA:`);
  debugLog(category, `      machineTypeRaw: ${data.machineTypeRaw}`);
  debugLog(category, `      hasLcd: ${data.hasLcd ?? (data.machineTypeRaw === 0x10)}`);
  if (data.machineName) {
    debugLog(category, `      name: ${data.machineName}`);
  }
}
