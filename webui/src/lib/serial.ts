import { writable, derived, type Writable, type Readable } from 'svelte/store';
import type { SerialConfig, PacketHandler } from './types';
import { decodePacket, isSynthesizePacket, isWavePacket, type SynthesizePacket, type WavePacket } from './packet-decoder';
import { createGetMachinePacket, createHeartbeatPacket } from './packet-encoder';
import { extractProtocolPackets } from './protocol';
/// <reference path="./types/web-serial.d.ts" />

export const ConnectionStatus = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
} as const;

export type DeviceType = 'M01' | 'M02' | 'Unknown';

export type DeviceInfo = {
  type: DeviceType;
  hasLCD: boolean;
};

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
  private heartbeatInterval: number | null = null;
  private statusStore: Writable<string>;
  private errorStore: Writable<string | null>;
  private deviceTypeStore: Writable<DeviceInfo | null>;
  private packetHandlers: Map<number, PacketHandler[]>;
  private receiveBuffer: Uint8Array;
  
  public readonly status: Readable<string>;
  public readonly error: Readable<string | null>;
  public readonly deviceType: Readable<DeviceInfo | null>;
  
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

  async connect() {
    if (this.port || this.reader || this.writer) {
      await this.disconnect();
    }
    try {
      this.statusStore.set(ConnectionStatus.CONNECTING);
      this.errorStore.set(null);

      if (!('serial' in navigator) || !navigator.serial) {
        throw new Error('Web Serial API not supported. Please use Chrome, Edge, or Opera.');
      }

      // Filter for Miniware devices
      // eslint-disable-next-line no-undef
      const filters: SerialPortRequestOptions = {
        filters: [
          { usbVendorId: 0x0416, usbProductId: 0xdc01 }  // Miniware MDP devices
        ]
      };
      
      this.port = await navigator.serial.requestPort(filters);
      await this.port.open(SERIAL_CONFIG);

      if (!this.port.readable || !this.port.writable) {
        throw new Error('Selected serial port did not provide readable and writable streams');
      }

      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();

      this.statusStore.set(ConnectionStatus.CONNECTED);
      
      // Start reading data (but don't await it)
      this.readLoop().catch(console.error);
      
      // Start heartbeat
      this.startHeartbeat();
      
      // Get device info (don't wait for response)
      this.getMachineType().catch(console.error);

    } catch (error: unknown) {
      await this.closeResources(false).catch(() => undefined);
      this.statusStore.set(ConnectionStatus.ERROR);
      this.errorStore.set(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async disconnect() {
    await this.closeResources(true);
  }

  private async closeResources(setDisconnected: boolean): Promise<void> {
    this.stopHeartbeat();
    const reader = this.reader;
    const writer = this.writer;
    const port = this.port;
    this.reader = null;
    this.writer = null;
    this.port = null;

    let firstError: unknown = null;
    try {
      await reader?.cancel();
    } catch (error) {
      firstError ??= error;
    } finally {
      reader?.releaseLock?.();
    }

    try {
      await writer?.close();
    } catch (error) {
      firstError ??= error;
    } finally {
      writer?.releaseLock?.();
    }

    try {
      await port?.close();
    } catch (error) {
      firstError ??= error;
    } finally {
      this.receiveBuffer = new Uint8Array(0);
      this.deviceTypeStore.set(null);
      if (setDisconnected) {
        this.statusStore.set(ConnectionStatus.DISCONNECTED);
        this.errorStore.set(null);
      }
    }

    if (firstError && setDisconnected) throw firstError;
  }

  async readLoop() {
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
        
      } catch (error: unknown) {
        console.error('Read error:', error);
        // Don't break immediately if not a disconnect error
        if (this.port && this.port.readable) {
          this.stopHeartbeat();
          this.statusStore.set(ConnectionStatus.ERROR);
          this.errorStore.set(error instanceof Error ? error.message : String(error));
          await this.closeResources(false).catch(() => undefined);
        }
        break; // Always break the loop on error
      }
    }
  }

  processIncomingData() {
    const { packets, remainder } = extractProtocolPackets(this.receiveBuffer);
    this.receiveBuffer = remainder;
    for (const packet of packets) {
      this.handlePacket(packet);
    }
  }

  handlePacket(packet: number[]): void {
    if (!packet || packet.length < 3) {
      return;
    }
    
    const packetType = packet[2];
    
    const handlers = this.packetHandlers.get(packetType) || [];
    
    if (handlers.length > 0) {
      handlers.forEach((handler) => {
        try {
          handler(packet);
        } catch {
          // Silently ignore handler errors to prevent one handler from breaking others
        }
      });
    }
  }

  async sendPacket(packet: number[] | Uint8Array): Promise<void> {
    if (!this.writer) {
      throw new Error('Not connected');
    }
    
    const uint8Array = packet instanceof Uint8Array ? packet : new Uint8Array(packet);
    await this.writer.write(uint8Array);
  }

  startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = window.setInterval(() => {
      this.sendHeartbeat().catch(console.error);
    }, 1000);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async sendHeartbeat(): Promise<void> {
    await this.sendPacket(createHeartbeatPacket());
  }

  async getMachineType(): Promise<void> {
    await this.sendPacket(createGetMachinePacket());
  }

  setDeviceType(deviceType: DeviceInfo | null): void {
    this.deviceTypeStore.set(deviceType);
  }

  registerPacketHandler(packetType: number, handler: PacketHandler): () => void {
    if (!this.packetHandlers.has(packetType)) {
      this.packetHandlers.set(packetType, []);
    }

    const handlers = this.packetHandlers.get(packetType);
    handlers?.push(handler);

    return () => {
      const list = this.packetHandlers.get(packetType);
      if (!list) return;

      const index = list.indexOf(handler);
      if (index >= 0) {
        list.splice(index, 1);
      }

      if (list.length === 0) {
        this.packetHandlers.delete(packetType);
      }
    };
  }

  getDecoder(): {
    decodeSynthesize: (packet: number[] | Uint8Array) => SynthesizePacket | null;
    decodeWave: (packet: number[] | Uint8Array) => WavePacket | null;
  } {
    // Decoder interface used by timeseries integration and tests.
    return {
      decodeSynthesize: (packet: number[] | Uint8Array) => {
        const decoded = decodePacket(packet);
        return decoded && isSynthesizePacket(decoded) ? decoded : null;
      },
      decodeWave: (packet: number[] | Uint8Array) => {
        const decoded = decodePacket(packet);
        return decoded && isWavePacket(decoded) ? decoded : null;
      }
    };
  }
}

export const serialConnection = new SerialConnection();
