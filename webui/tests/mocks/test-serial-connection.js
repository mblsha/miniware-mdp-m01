import { writable, derived } from 'svelte/store';
import { extractProtocolPackets } from '../../src/lib/protocol.js';

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

/**
 * Test-specific SerialConnection that eliminates the infinite readLoop
 * and provides controlled packet processing for reliable testing
 */
export class TestSerialConnection {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.heartbeatInterval = null;
    this.statusStore = writable(ConnectionStatus.DISCONNECTED);
    this.errorStore = writable(null);
    this.deviceTypeStore = writable(null);
    this.packetHandlers = new Map();
    this.receiveBuffer = []; // Persistent buffer for partial packets
    this.readPromise = null;
  }

  get status() {
    return derived(this.statusStore, $status => $status);
  }

  get error() {
    return derived(this.errorStore, $error => $error);
  }

  get deviceType() {
    return derived(this.deviceTypeStore, $device => $device);
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
      
      // For tests, don't start the blocking readLoop
      // Data will be processed via triggerPacketProcessing
      
      // Start heartbeat
      this.startHeartbeat();
      
      // Get device info (non-blocking)
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
    
    this.statusStore.set(ConnectionStatus.DISCONNECTED);
    this.deviceTypeStore.set(null);
    this.receiveBuffer = []; // Clear buffer on disconnect
  }

  async readLoop() {
    // Test-optimized readLoop that properly handles errors
    try {
      while (this.port && this.reader) {
        // Use the actual read() method to properly catch errors
        const { value, done } = await this.reader.read();
        if (done) break;
        
        if (value && value.length > 0) {
          this.receiveBuffer.push(...value);
          this.processBuffer();
        }
      }
    } catch (error) {
      console.error('Read loop error:', error);
      this.statusStore.set(ConnectionStatus.ERROR);
      this.errorStore.set(error.message);
    }
  }

  processBuffer() {
    const { packets, remainder } = extractProtocolPackets(
      Uint8Array.from(this.receiveBuffer)
    );
    this.receiveBuffer = Array.from(remainder);
    for (const packet of packets) {
      this.handlePacket(packet);
    }
  }

  handlePacket(packet) {
    const packetType = packet[2];
    const handler = this.packetHandlers.get(packetType);
    
    if (handler) {
      handler(packet);
    }
  }

  registerPacketHandler(packetType, handler) {
    // Match the real implementation - single handler per type
    this.packetHandlers.set(packetType, handler);
  }

  clearPacketHandlers() {
    this.packetHandlers.clear();
  }

  clearReceiveBuffer() {
    this.receiveBuffer = [];
  }

  // Test-specific method to trigger packet processing without waiting for readLoop
  async triggerPacketProcessing() {
    // Directly process data from the reader's queue without using read()
    if (this.reader && this.reader.dataQueue && this.reader.dataQueue.length > 0) {
      while (this.reader.dataQueue.length > 0) {
        const data = this.reader.dataQueue.shift();
        if (data && data.length > 0) {
          this.receiveBuffer.push(...data);
        }
      }
      this.processBuffer();
    }
    
    // Process any simulated errors
    if (this.reader && this.reader.simulateError) {
      const error = this.reader.simulateError;
      this.reader.simulateError = null;
      this.statusStore.set(ConnectionStatus.ERROR);
      this.errorStore.set(error.message);
    }
  }

  async sendPacket(packet) {
    if (!this.writer) {
      throw new Error('Not connected');
    }
    
    const uint8Array = new Uint8Array(packet);
    await this.writer.write(uint8Array);
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
