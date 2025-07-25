// Debug logging utility with conditional logging and human-readable packet names
import { writable } from 'svelte/store';
import { getMachineTypeString } from './machine-utils.js';

// Debug logging enabled state
export const debugEnabled = writable(true); // Default enabled

// Packet type name mappings
export const PACKET_TYPE_NAMES = {
  17: 'SYNTHESIZE',    // 0x11
  18: 'WAVE',          // 0x12  
  19: 'ADDR',          // 0x13
  20: 'UPDATE_CH',     // 0x14
  21: 'MACHINE',       // 0x15
  22: 'SET_ISOUTPUT',  // 0x16
  23: 'GET_ADDR',      // 0x17
  24: 'SET_ADDR',      // 0x18
  25: 'SET_CH',        // 0x19
  26: 'SET_V',         // 0x1A
  27: 'SET_I',         // 0x1B
  28: 'SET_ALL_ADDR',  // 0x1C
  29: 'START_AUTO_MATCH', // 0x1D
  30: 'STOP_AUTO_MATCH',  // 0x1E
  31: 'RESET_TO_DFU',     // 0x1F
  32: 'RGB',              // 0x20
  33: 'GET_MACHINE',      // 0x21
  34: 'HEARTBEAT'         // 0x22
};

export function getPacketTypeName(typeNumber) {
  return PACKET_TYPE_NAMES[typeNumber] || `UNKNOWN_${typeNumber}`;
}

export function getPacketTypeDisplay(typeNumber) {
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

export function debugLog(category, message, ...args) {
  if (!currentDebugState) return;
  
  const prefix = getLogPrefix(category);
  console.log(prefix + message, ...args);
}

export function debugWarn(category, message, ...args) {
  if (!currentDebugState) return;
  
  const prefix = getLogPrefix(category);
  console.warn(prefix + message, ...args);
}

export function debugError(category, message, ...args) {
  if (!currentDebugState) return;
  
  const prefix = getLogPrefix(category);
  console.error(prefix + message, ...args);
}

function getLogPrefix(category) {
  const prefixes = {
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
  return prefixes[category] || '🔍 DEBUG: ';
}

// Enhanced packet data logging
export function logPacketData(category, packet, decoded = null) {
  if (!currentDebugState) return;
  
  if (!packet || packet.length < 3) {
    debugError(category, 'Invalid packet data');
    return;
  }
  
  const packetType = packet[2];
  const typeName = getPacketTypeDisplay(packetType);
  
  debugLog(category, `=== ${typeName} PACKET ===`);
  debugLog(category, `  Length: ${packet.length} bytes`);
  debugLog(category, `  Hex: ${Array.from(packet.slice(0, Math.min(32, packet.length))).map(b => b.toString(16).padStart(2, '0')).join(' ')}${packet.length > 32 ? '...' : ''}`);
  
  if (decoded) {
    logDecodedKaitaiData(category, decoded);
  }
}

// Log detailed Kaitai decoded data
export function logDecodedKaitaiData(category, decoded) {
  if (!currentDebugState) return;
  
  debugLog(category, '  📋 DECODED KAITAI DATA:');
  debugLog(category, `    Pack Type: ${getPacketTypeDisplay(decoded.packType)}`);
  debugLog(category, `    Data Object Type: ${decoded.data?.constructor?.name || 'Unknown'}`);
  
  if (decoded.data) {
    switch (decoded.packType) {
      case 17: // SYNTHESIZE
        logSynthesizeData(category, decoded.data);
        break;
      case 18: // WAVE  
        logWaveData(category, decoded.data);
        break;
      case 19: // ADDR
        logAddrData(category, decoded.data);
        break;
      case 21: // MACHINE
        logMachineData(category, decoded.data);
        break;
      default:
        debugLog(category, `    Data: ${JSON.stringify(decoded.data, null, 2)}`);
    }
  }
}

function logSynthesizeData(category, data) {
  debugLog(category, `    📡 SYNTHESIZE DATA:`);
  debugLog(category, `      Channels available: ${data.channels?.length || 0}`);
  
  if (data.channels) {
    data.channels.forEach((ch, i) => {
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
}

function logWaveData(category, data) {
  debugLog(category, `    📊 WAVE DATA:`);
  debugLog(category, `      Channel: ${data.channel}`);
  debugLog(category, `      Groups: ${data.groups?.length || 0}`);
  
  if (data.groups && data.groups.length > 0) {
    const firstGroup = data.groups[0];
    debugLog(category, `      First Group - Timestamp: ${firstGroup.timestamp}, Points: ${firstGroup.items?.length || 0}`);
    if (firstGroup.items && firstGroup.items.length > 0) {
      const firstPoint = firstGroup.items[0];
      debugLog(category, `        First Point: ${firstPoint.voltage}V, ${firstPoint.current}A`);
    }
  }
}

function logAddrData(category, data) {
  debugLog(category, `    📍 ADDRESS DATA:`);
  if (data.addresses) {
    data.addresses.forEach((addr, i) => {
      const addressBytes = Array.from(addr.address).map(b => b.toString(16).padStart(2, '0')).join(':');
      const frequency = 2400 + addr.frequencyOffset;
      debugLog(category, `      Channel ${i}: ${addressBytes} @ ${frequency}MHz`);
    });
  }
}

function logMachineData(category, data) {
  debugLog(category, `    🏭 MACHINE DATA:`);
  debugLog(category, `      Type: ${data.type} (${getMachineTypeString(data.type)})`);
}
