import { KaitaiStream, MiniwareMdpM01 } from './kaitai-wrapper.js';
import { debugLog, debugError, debugWarn, logDecodedKaitaiData, getPacketTypeDisplay, debugEnabled } from './debug-logger.js';
import { getMachineTypeString } from './machine-utils.js';
import { get } from 'svelte/store';

export const PackType = MiniwareMdpM01?.PackType || {
  SYNTHESIZE: 0x11,
  WAVE: 0x12,
  ADDR: 0x13,
  UPDAT_CH: 0x14,
  MACHINE: 0x15,
  SET_ISOUTPUT: 0x16,
  ERR_240: 0x23
};

export function decodePacket(data) {
  const currentDebugState = get(debugEnabled);
  
  if (currentDebugState) {
    console.log('🔍 decodePacket() called, data length:', data ? data.length : 'null');
  }
  
  try {
    debugLog('packet-decode', 'DECODE PACKET START');
    debugLog('packet-decode', `  Input data length: ${data ? data.length : 'null'}`);
    
    if (!data || data.length < 6) {
      if (currentDebugState) {
        console.log('❌ decodePacket FAILED: Invalid data or too short');
      }
      debugError('packet-decode', '  ❌ Invalid data or too short');
      return null;
    }
    
    // Validate packet header
    if (data[0] !== 0x5A || data[1] !== 0x5A) {
      console.log('🚨 MALFORMED DATA: Invalid packet header');
      console.log(`  Expected: 0x5A 0x5A, Got: 0x${data[0]?.toString(16).padStart(2, '0')} 0x${data[1]?.toString(16).padStart(2, '0')}`);
      if (currentDebugState) {
        console.log('❌ decodePacket FAILED: Invalid packet header', data[0], data[1]);
      }
      debugError('packet-decode', '  ❌ Invalid packet header');
      return null;
    }
    
    const packetType = data[2];
    const typeDisplay = getPacketTypeDisplay(packetType);
    debugLog('packet-decode', `  Packet type: ${typeDisplay}`);
    
    // Validate packet size
    const expectedSize = data[3];
    if (data.length !== expectedSize) {
      console.log('🚨 MALFORMED DATA: Packet size mismatch');
      console.log(`  Expected size: ${expectedSize}, Actual size: ${data.length}`);
      console.log(`  Packet data (hex): ${Array.from(data.slice(0, Math.min(16, data.length))).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      if (currentDebugState) {
        console.log('❌ decodePacket FAILED: Size mismatch, expected:', expectedSize, 'got:', data.length);
      }
      debugError('packet-decode', `  ❌ Packet size mismatch: expected ${expectedSize}, got ${data.length}`);
      return null;
    }

    debugLog('packet-decode', '  ✅ Packet validation passed');
    debugLog('kaitai', 'Creating Kaitai parser...');

    const buffer = new ArrayBuffer(data.length);
    const view = new Uint8Array(buffer);
    data.forEach((byte, i) => view[i] = byte);
    
    const stream = new KaitaiStream(buffer);
    const parsed = new MiniwareMdpM01(stream);
    
    debugLog('kaitai', 'Kaitai parser created successfully');
    debugLog('kaitai', `Parsed object type: ${parsed.constructor.name}`);
    debugLog('kaitai', `Packets array length: ${parsed.packets ? parsed.packets.length : 'no packets array'}`);
    
    // The parser creates a packets array, get the first (and only) packet
    if (parsed.packets && parsed.packets.length > 0) {
      const packet = parsed.packets[0];
      
      if (currentDebugState) {
        console.log('✅ decodePacket SUCCESS for packet type:', getPacketTypeDisplay(packet.packType));
        // Direct console.log of decoded data - only when debug enabled
        console.log('decoded_data:', packet.data);
      }
      
      debugLog('kaitai', `✅ Got packet from Kaitai`);
      debugLog('kaitai', `  Pack type: ${getPacketTypeDisplay(packet.packType)}`);
      debugLog('kaitai', `  Data object type: ${packet.data?.constructor?.name || 'Unknown'}`);
      
      // Log detailed decoded data
      logDecodedKaitaiData('kaitai', packet);
      
      return packet;
    }
    
    if (currentDebugState) {
      console.log('❌ decodePacket FAILED: No packets found in parsed result');
    }
    debugError('kaitai', '  ❌ No packets found in parsed result');
    return null;
  } catch (error) {
    if (currentDebugState) {
      console.log('❌ decodePacket FAILED with exception:', error.message);
    }
    debugError('packet-decode', `  ❌ Failed to decode packet: ${error.message}`);
    debugError('packet-decode', `  Stack: ${error.stack}`);
    return null;
  }
}

export function processSynthesizePacket(packet) {
  debugLog('synthesize', 'PROCESS SYNTHESIZE PACKET START');
  debugLog('synthesize', '  Packet:', packet);
  debugLog('synthesize', '  Packet type check:', packet ? packet.packType : 'no packet');
  debugLog('synthesize', '  Expected type (PackType.SYNTHESIZE):', PackType.SYNTHESIZE);
  debugLog('synthesize', '  PackType object:', PackType);
  
  if (!packet || !packet.data) {
    debugError('synthesize', '  ❌ No packet or no data');
    return null;
  }
  
  if (packet.packType !== PackType.SYNTHESIZE) {
    debugError('synthesize', '  ❌ Wrong packet type. Got:', packet.packType, 'Expected:', PackType.SYNTHESIZE);
    debugLog('synthesize', '  PackType === 17?', PackType.SYNTHESIZE === 17);
    debugLog('synthesize', '  packet.packType === 17?', packet.packType === 17);
    return null;
  }
  
  const synthesize = packet.data;
  debugLog('synthesize', '  Synthesize data object:', synthesize);
  debugLog('synthesize', '  Channels array:', synthesize.channels);
  debugLog('synthesize', '  Channels length:', synthesize.channels ? synthesize.channels.length : 'no channels');
  
  const channels = [];
  
  for (let i = 0; i < 6; i++) {
    debugLog('synthesize', `  🔍 Processing channel ${i}:`);
    
    if (!synthesize.channels || !synthesize.channels[i]) {
      debugWarn('synthesize', `    ❌ No data for channel ${i}`);
      channels.push({
        channel: i,
        online: false,
        machineType: 'Unknown',
        voltage: 0,
        current: 0,
        power: 0,
        temperature: 0,
        isOutput: false,
        mode: 'Normal'
      });
      continue;
    }
    
    const ch = synthesize.channels[i];
    debugLog('synthesize', `    Raw channel data:`, ch);
    debugLog('synthesize', `    Online raw value:`, ch.online);
    debugLog('synthesize', `    Online !== 0:`, ch.online !== 0);
    debugLog('synthesize', `    OutVoltage:`, ch.outVoltage);
    debugLog('synthesize', `    OutCurrent:`, ch.outCurrent);
    debugLog('synthesize', `    Temperature:`, ch.temperature);
    debugLog('synthesize', `    OutputOn:`, ch.outputOn);
    debugLog('synthesize', `    Type:`, ch.type);
    
    const channelData = {
      channel: i,
      online: ch.online !== 0,
      machineType: getMachineTypeString(ch.type),
      voltage: ch.outVoltage || 0, // Kaitai already converts to V
      current: ch.outCurrent || 0, // Kaitai already converts to A
      power: (ch.outVoltage || 0) * (ch.outCurrent || 0), // W
      temperature: ch.temperature || 0, // Kaitai already converts to °C
      isOutput: ch.outputOn !== 0,
      mode: getOperatingMode(ch),
      // Add input measurements for extended view
      inputVoltage: ch.inVoltage || 0, // Kaitai already converts to V
      inputCurrent: ch.inCurrent || 0, // Kaitai already converts to A
      inputPower: (ch.inVoltage || 0) * (ch.inCurrent || 0), // W
      // Add target values
      targetVoltage: ch.setVoltage || 0, // Kaitai already converts to V
      targetCurrent: ch.setCurrent || 0, // Kaitai already converts to A
      targetPower: (ch.setVoltage || 0) * (ch.setCurrent || 0) // W
    };
    
    debugLog('synthesize', `    ✅ Processed channel ${i}:`, channelData);
    channels.push(channelData);
  }
  
  debugLog('synthesize', '  📋 All processed channels:', channels);
  debugLog('synthesize', '  🎯 Online channels:', channels.filter(ch => ch.online).map(ch => ch.channel));
  
  return channels;
}

export function processWavePacket(packet) {
  if (!packet || !packet.data || packet.packType !== PackType.WAVE) return null;
  
  const wave = packet.data;
  const points = [];
  
  wave.groups.forEach((group) => {
    group.items.forEach((item) => {
      points.push({
        timestamp: group.timestamp, // All items in a group share the same timestamp
        voltage: item.voltage, // Kaitai already converts to V
        current: item.current  // Kaitai already converts to A
      });
    });
  });
  
  return {
    channel: packet.data.channel,
    points
  };
}

export function processAddressPacket(packet) {
  if (!packet || !packet.data || packet.packType !== PackType.ADDR) return null;
  
  const addr = packet.data;
  const addresses = [];
  
  for (let i = 0; i < 6; i++) {
    const ch = addr.addresses[i];
    addresses.push({
      channel: i,
      address: Array.from(ch.address), // Keep as is for tests
      frequency: 2400 + ch.frequencyOffset // MHz
    });
  }
  
  return addresses;
}

export function processMachinePacket(packet) {
  if (!packet || !packet.data || packet.packType !== PackType.MACHINE) return null;
  
  const machine = packet.data;
  
  // Use machineTypeRaw if available, otherwise fall back to deviceType
  const machineTypeValue = machine.machineTypeRaw || machine.deviceType;
  
  return {
    type: machineTypeValue === 0x10 ? 'M01' : 'M02',
    hasLCD: machineTypeValue === 0x10
  };
}


function getOperatingMode(channel) {
  if (channel.type === 3) { // L1060
    switch(channel.statusLoad) {
      case 0: return 'CC';
      case 1: return 'CV';
      case 2: return 'CR';
      case 3: return 'CP';
    }
  } else if (channel.type === 2) { // P906
    switch(channel.statusPsu) {
      case 1: return 'CC';
      case 2: return 'CV';
      default: return 'Normal';
    }
  }
  return 'Normal';
}
