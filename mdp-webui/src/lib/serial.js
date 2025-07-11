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
    
    this.statusStore.set(ConnectionStatus.DISCONNECTED);
    this.deviceTypeStore.set(null);
  }

  async readLoop() {
    const buffer = [];
    
    while (this.port && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) break;
        
        // value is a Uint8Array
        buffer.push(...value);
        
        // Process complete packets
        this.processBuffer(buffer);
        
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

  processBuffer(buffer) {
    while (buffer.length >= 6) {
      // Find the start of a packet
      while (buffer.length > 0 && buffer[0] !== 0x5A) {
        buffer.shift();
      }
      
      
      // If not enough data for a header, break
      if (buffer.length < 2) break;

      // Check for full packet header
      if (buffer[0] !== 0x5A || buffer[1] !== 0x5A) {
        // This case should be rare now, but as a safeguard:
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
    if (!packet || packet.length < 3) {
      console.error('Invalid packet:', packet);
      return;
    }
    const packetType = packet[2];
    const handler = this.packetHandlers.get(packetType);
    
    if (handler) {
      handler(packet);
    }
  }

  registerPacketHandler(packetType, handler) {
    this.packetHandlers.set(packetType, handler);
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

export const serialConnection = new SerialConnection();