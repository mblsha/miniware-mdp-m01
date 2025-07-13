import { writable, derived } from 'svelte/store';
import { debugLog, debugError, debugWarn, logPacketData, getPacketTypeDisplay } from './debug-logger.js';
import { decodePacket } from './packet-decoder.js';

export const ConnectionStatus = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
};

const SERIAL_CONFIG = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none'
};

export class SerialConnection {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readPromise = null;
    this.heartbeatInterval = null;
    this.statusStore = writable(ConnectionStatus.DISCONNECTED);
    this.errorStore = writable(null);
    this.deviceTypeStore = writable(null);
    this.packetHandlers = new Map();
    
    // Buffer for incomplete packets
    this.receiveBuffer = new Uint8Array(0);
    
    // Create derived stores once
    this.status = derived(this.statusStore, $status => $status);
    this.error = derived(this.errorStore, $error => $error);
    this.deviceType = derived(this.deviceTypeStore, $device => $device);
  }

  async connect() {
    try {
      this.statusStore.set(ConnectionStatus.CONNECTING);
      this.errorStore.set(null);

      if (!('serial' in navigator)) {
        throw new Error('Web Serial API not supported. Please use Chrome, Edge, or Opera.');
      }

      this.port = await navigator.serial.requestPort();
      await this.port.open(SERIAL_CONFIG);

      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();

      this.statusStore.set(ConnectionStatus.CONNECTED);
      
      // Start reading data (but don't await it)
      this.readPromise = this.readLoop();
      
      // Start heartbeat
      this.startHeartbeat();
      
      // Get device info (don't wait for response)
      this.getMachineType().catch(console.error);

    } catch (error) {
      this.statusStore.set(ConnectionStatus.ERROR);
      this.errorStore.set(error.message);
      throw error;
    }
  }

  async disconnect() {
    this.stopHeartbeat();
    
    if (this.reader) {
      await this.reader.cancel();
      this.reader = null;
    }
    
    if (this.writer) {
      await this.writer.close();
      this.writer = null;
    }
    
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
    
    // Clear receive buffer
    this.receiveBuffer = new Uint8Array(0);
    
    this.statusStore.set(ConnectionStatus.DISCONNECTED);
    this.deviceTypeStore.set(null);
  }

  async readLoop() {
    while (this.port && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) break;
        
        // Append new data to buffer
        if (value && value.length > 0) {
          debugLog('raw-serial', 'DATA RECEIVED');
          debugLog('raw-serial', `  Bytes: ${value.length}`);
          debugLog('raw-serial', `  Hex: ${Array.from(value).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
          debugLog('raw-serial', `  ASCII: ${Array.from(value).map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '.').join('')}`);
          debugLog('raw-serial', `  Buffer before: ${this.receiveBuffer.length} bytes`);
          
          const combined = new Uint8Array(this.receiveBuffer.length + value.length);
          combined.set(this.receiveBuffer);
          combined.set(value, this.receiveBuffer.length);
          this.receiveBuffer = combined;
          
          debugLog('raw-serial', `  Buffer after: ${this.receiveBuffer.length} bytes`);
          
          // Process complete packets
          this.processIncomingData();
        }
        
      } catch (error) {
        console.error('Read error:', error);
        // Don't break immediately if not a disconnect error
        if (this.port && this.port.readable) {
          this.statusStore.set(ConnectionStatus.ERROR);
          this.errorStore.set(error.message);
        }
        break; // Always break the loop on error
      }
    }
  }

  processIncomingData() {
    debugLog('packet-parse', 'PROCESSING INCOMING DATA');
    debugLog('packet-parse', `  Buffer length: ${this.receiveBuffer.length}`);
    debugLog('packet-parse', `  Buffer hex: ${Array.from(this.receiveBuffer.slice(0, Math.min(32, this.receiveBuffer.length))).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    
    while (this.receiveBuffer.length >= 6) {
      // Find packet header (0x5A 0x5A)
      let headerIndex = -1;
      for (let i = 0; i <= this.receiveBuffer.length - 2; i++) {
        if (this.receiveBuffer[i] === 0x5A && this.receiveBuffer[i + 1] === 0x5A) {
          headerIndex = i;
          break;
        }
      }

      debugLog('packet-parse', `  Header search: index = ${headerIndex}`);

      // No valid header found
      if (headerIndex === -1) {
        debugLog('packet-parse', '  ❌ No valid header (0x5A 0x5A) found in buffer');
        // Log malformed data
        console.log('🚨 MALFORMED DATA: No valid packet header found');
        console.log('  Buffer contents (hex):', Array.from(this.receiveBuffer.slice(0, Math.min(32, this.receiveBuffer.length))).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // If we have more than 256 bytes without a header, clear buffer to prevent memory issues
        if (this.receiveBuffer.length > 256) {
          debugWarn('packet-parse', '  🗑️ Clearing receive buffer - no valid header found');
          console.log('🚨 MALFORMED DATA: Clearing large buffer with no valid headers');
          this.receiveBuffer = new Uint8Array(0);
        }
        break;
      }

      debugLog('packet-parse', `  ✅ Found header at index ${headerIndex}`);

      // Remove any garbage before header
      if (headerIndex > 0) {
        debugLog('packet-parse', `  🗑️ Removing ${headerIndex} garbage bytes before header`);
        console.log('🚨 MALFORMED DATA: Found garbage bytes before valid header');
        console.log(`  Garbage bytes (${headerIndex}):`, Array.from(this.receiveBuffer.slice(0, headerIndex)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        this.receiveBuffer = this.receiveBuffer.slice(headerIndex);
      }

      // Check if we have enough data for the complete packet
      if (this.receiveBuffer.length < 4) {
        debugLog('packet-parse', `  ⏳ Need more data for packet size (have ${this.receiveBuffer.length}, need 4)`);
        break; // Need at least 4 bytes to read size
      }
      
      const packetSize = this.receiveBuffer[3];
      debugLog('packet-parse', `  📏 Packet size from header: ${packetSize}`);
      
      if (this.receiveBuffer.length < packetSize) {
        debugLog('packet-parse', `  ⏳ Need more data for complete packet (have ${this.receiveBuffer.length}, need ${packetSize})`);
        // Not enough data yet for complete packet
        break;
      }
      
      // Extract complete packet
      const packet = this.receiveBuffer.slice(0, packetSize);
      logPacketData('packet-parse', Array.from(packet));
      
      this.handlePacket(Array.from(packet)); // Convert to array for compatibility
      
      // Remove processed packet from buffer
      this.receiveBuffer = this.receiveBuffer.slice(packetSize);
      debugLog('packet-parse', `  ✂️ Removed packet from buffer, remaining: ${this.receiveBuffer.length} bytes`);
    }
  }

  handlePacket(packet) {
    debugLog('packet-handle', 'HANDLING PACKET');
    debugLog('packet-handle', `  Length: ${packet ? packet.length : 'null'}`);
    
    if (!packet || packet.length < 3) {
      debugError('packet-handle', `  ❌ Invalid packet: ${packet}`);
      return;
    }
    
    const packetType = packet[2];
    const typeDisplay = getPacketTypeDisplay(packetType);
    debugLog('packet-handle', `  Packet type: ${typeDisplay}`);
    
    // ALWAYS try to decode the packet for debugging purposes
    try {
      decodePacket(packet);
    } catch (error) {
      console.log('Failed to decode packet in fallback:', error.message);
    }
    
    const handlers = this.packetHandlers.get(packetType) || [];
    debugLog('packet-handle', `  Handlers registered: ${handlers.length}`);
    
    if (handlers.length > 0) {
      debugLog('packet-handle', `  🚀 Calling ${handlers.length} packet handlers for ${typeDisplay}`);
      
      handlers.forEach((handler, index) => {
        try {
          handler(packet);
          debugLog('packet-handle', `  ✅ Handler ${index + 1} completed successfully for ${typeDisplay}`);
        } catch (error) {
          debugError('packet-handle', `  ❌ Handler ${index + 1} error for ${typeDisplay}:`, error);
        }
      });
    } else {
      debugWarn('packet-handle', `  ⚠️ No handlers registered for ${typeDisplay}`);
      debugLog('packet-handle', `  Registered packet types: ${Array.from(this.packetHandlers.keys()).map(t => getPacketTypeDisplay(t)).join(', ')}`);
    }
  }

  registerPacketHandler(packetType, handler) {
    if (!this.packetHandlers.has(packetType)) {
      this.packetHandlers.set(packetType, []);
    }
    this.packetHandlers.get(packetType).push(handler);
    debugLog('packet-register', `Registered handler for ${getPacketTypeDisplay(packetType)} (total: ${this.packetHandlers.get(packetType).length})`);
  }

  async sendPacket(packet) {
    if (!this.writer) {
      throw new Error('Not connected');
    }
    
    logPacketData('packet-send', packet);
    
    const uint8Array = new Uint8Array(packet);
    await this.writer.write(uint8Array);
    debugLog('packet-send', '✅ Packet sent successfully');
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat().catch(console.error);
    }, 1000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async sendHeartbeat() {
    const packet = [0x5A, 0x5A, 0x22, 0x06, 0xEE, 0x00];
    await this.sendPacket(packet);
  }

  async getMachineType() {
    const packet = [0x5A, 0x5A, 0x21, 0x06, 0xEE, 0x00];
    await this.sendPacket(packet);
  }
}

export const serialConnection = new SerialConnection();