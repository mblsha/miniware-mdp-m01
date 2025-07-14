import { writable, derived, type Writable, type Readable } from 'svelte/store';
// Removed unused imports: debugLog, debugError, debugWarn, logPacketData, getPacketTypeDisplay, decodePacket

export const ConnectionStatus = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
} as const;

// Type definitions
type ConnectionStatusType = typeof ConnectionStatus[keyof typeof ConnectionStatus];

interface SerialConfig {
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: string;
  flowControl: string;
}

type PacketHandler = (packet: Uint8Array) => void;

const SERIAL_CONFIG: SerialConfig = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none'
};

export class SerialConnection {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readPromise: Promise<void> | null = null;
  private heartbeatInterval: number | null = null;
  private statusStore: Writable<ConnectionStatusType>;
  private errorStore: Writable<string | null>;
  private deviceTypeStore: Writable<string | null>;
  private packetHandlers: Map<number, PacketHandler>;

  constructor() {
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

  // Public properties
  public receiveBuffer: Uint8Array;
  public readonly status: Readable<ConnectionStatusType>;
  public readonly error: Readable<string | null>;
  public readonly deviceType: Readable<string | null>;

  async connect(): Promise<void> {
    try {
      this.statusStore.set(ConnectionStatus.CONNECTING);
      this.errorStore.set(null);

      if (!('serial' in navigator)) {
        throw new Error('Web Serial API not supported. Please use Chrome, Edge, or Opera.');
      }

      // Filter for Miniware devices
      const filters = [
        { usbVendorId: 0x0416, usbProductId: 0xdc01 }  // Miniware MDP devices
      ];
      
      try {
        // Try with filters first
        this.port = await navigator.serial.requestPort({ filters });
      } catch (error) {
        // If user cancels or no matching devices, show all devices as fallback
        if (error.name === 'NotFoundError' || error.name === 'AbortError') {
          console.warn('No Miniware devices found or user cancelled. Showing all devices...');
          this.port = await navigator.serial.requestPort();
        } else {
          throw error;
        }
      }
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

  async disconnect(): Promise<void> {
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

  private async readLoop(): Promise<void> {
    while (this.port && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) break;
        
        // Append new data to buffer
        if (value && value.length > 0) {
          const combined = new Uint8Array(this.receiveBuffer.length + value.length);
          combined.set(this.receiveBuffer);
          combined.set(value, this.receiveBuffer.length);
          this.receiveBuffer = combined;
          
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

  private processIncomingData(): void {
    while (this.receiveBuffer.length >= 6) {
      // Find packet header (0x5A 0x5A)
      let headerIndex = -1;
      for (let i = 0; i <= this.receiveBuffer.length - 2; i++) {
        if (this.receiveBuffer[i] === 0x5A && this.receiveBuffer[i + 1] === 0x5A) {
          headerIndex = i;
          break;
        }
      }

      // No valid header found
      if (headerIndex === -1) {
        // If we have more than 256 bytes without a header, clear buffer to prevent memory issues
        if (this.receiveBuffer.length > 256) {
          this.receiveBuffer = new Uint8Array(0);
        }
        break;
      }

      // Remove any garbage before header
      if (headerIndex > 0) {
        this.receiveBuffer = this.receiveBuffer.slice(headerIndex);
      }

      // Check if we have enough data for the complete packet
      if (this.receiveBuffer.length < 4) {
        break; // Need at least 4 bytes to read size
      }
      
      const packetSize = this.receiveBuffer[3];
      
      if (this.receiveBuffer.length < packetSize) {
        // Not enough data yet for complete packet
        break;
      }
      
      // Extract complete packet
      const packet = this.receiveBuffer.slice(0, packetSize);
      
      this.handlePacket(Array.from(packet)); // Convert to array for compatibility
      
      // Remove processed packet from buffer
      this.receiveBuffer = this.receiveBuffer.slice(packetSize);
    }
  }

  private handlePacket(packet: number[]): void {
    if (!packet || packet.length < 3) {
      return;
    }
    
    const packetType = packet[2];
    
    const handlers = this.packetHandlers.get(packetType);
    
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(new Uint8Array(packet));
        } catch {
          // Silently ignore handler errors to prevent one handler from breaking others
        }
      });
    }
  }

  registerPacketHandler(packetType: number, handler: PacketHandler): void {
    if (!this.packetHandlers.has(packetType)) {
      this.packetHandlers.set(packetType, []);
    }
    this.packetHandlers.get(packetType)!.push(handler);
  }

  async sendPacket(packet: number[] | Uint8Array): Promise<void> {
    if (!this.writer) {
      throw new Error('Not connected');
    }
    
    const uint8Array = packet instanceof Uint8Array ? packet : new Uint8Array(packet);
    await this.writer.write(uint8Array);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat().catch(console.error);
    }, 1000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async sendHeartbeat(): Promise<void> {
    const packet = [0x5A, 0x5A, 0x22, 0x06, 0xEE, 0x00];
    await this.sendPacket(packet);
  }

  private async getMachineType(): Promise<void> {
    const packet = [0x5A, 0x5A, 0x21, 0x06, 0xEE, 0x00];
    await this.sendPacket(packet);
  }

  getDecoder(): any {
    // This method should return a decoder instance
    // Implementation depends on the packet decoder adapter
    return null; // Placeholder - needs actual implementation
  }
}

export const serialConnection = new SerialConnection();
