import { writable, derived } from 'svelte/store';

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
    this.isProcessing = false;
    this.processingPromise = null;
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
      
      // Start controlled packet processing
      this.startPacketProcessing();
      
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
    this.stopPacketProcessing();
    
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
  }

  /**
   * Controlled packet processing that doesn't use infinite loops or timers
   * Only processes data when explicitly triggered
   */
  startPacketProcessing() {
    this.isProcessing = true;
    // Don't start any automatic processing - wait for explicit triggers
  }

  stopPacketProcessing() {
    this.isProcessing = false;
  }

  async processAvailableData() {
    if (!this.isProcessing || !this.reader) return;

    try {
      const buffer = [];
      
      // Read ALL available data in one go (no loops or timers)
      let readAttempts = 0;
      let totalBytesRead = 0;
      while (readAttempts < 10) { // Limit attempts to prevent hanging
        const { value, done } = await this.reader.read();
        
        if (done) break;
        
        if (value && value.length > 0) {
          buffer.push(...value);
          totalBytesRead += value.length;
        } else {
          // No data available, stop reading
          break;
        }
        
        readAttempts++;
      }

      // Process all collected data
      if (buffer.length > 0) {
        this.processBuffer(buffer);
      }

    } catch (error) {
      console.error('Read error:', error);
      if (this.port && this.port.readable) {
        this.statusStore.set(ConnectionStatus.ERROR);
        this.errorStore.set(error.message);
      }
    }
  }

  processBuffer(buffer) {
    while (buffer.length >= 6) {
      // Find the start of a packet
      while (buffer.length > 0 && buffer[0] !== 0x5A) {
        buffer.shift();
      }
      
      // If not enough data for a header, break
      if (buffer.length < 4) break;

      // Check for full packet header
      if (buffer[0] !== 0x5A || buffer[1] !== 0x5A) {
        buffer.shift();
        continue;
      }
      
      const packetSize = buffer[3];
      if (buffer.length < packetSize) {
        // Not enough data yet
        break;
      }
      
      // Extract complete packet
      const packet = buffer.splice(0, packetSize);
      this.handlePacket(packet);
    }
  }

  handlePacket(packet) {
    const packetType = packet[2];
    const handlers = this.packetHandlers.get(packetType);
    
    if (handlers && Array.isArray(handlers)) {
      handlers.forEach(handler => handler(packet));
    }
  }

  registerPacketHandler(packetType, handler) {
    // Support multiple handlers by storing an array
    if (!this.packetHandlers.has(packetType)) {
      this.packetHandlers.set(packetType, []);
    }
    this.packetHandlers.get(packetType).push(handler);
  }

  clearPacketHandlers() {
    this.packetHandlers.clear();
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

  /**
   * Test helper: trigger packet processing cycle
   * Use this in tests after simulating data to ensure processing
   */
  async triggerPacketProcessing() {
    if (this.isProcessing) {
      await this.processAvailableData();
    }
  }
}