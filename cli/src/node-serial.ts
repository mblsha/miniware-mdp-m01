import { SerialPort } from 'serialport';
import type { PacketHandler, RawDataHandler, SerialConfig } from './serial-types';
import { extractProtocolPackets } from '../../webui/src/lib/protocol';

const DEFAULT_CONFIG: SerialConfig = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none'
};

export interface NodeSerialConnectionOptions {
  portPath: string;
  config?: Partial<SerialConfig>;
}

export class NodeSerialConnection {
  private readonly portPath: string;
  private readonly config: SerialConfig;
  private port: SerialPort | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly packetHandlers = new Map<number, PacketHandler[]>();
  private readonly rawDataHandlers = new Set<RawDataHandler>();
  private readonly packetObservers = new Set<PacketHandler>();
  private receiveBuffer = Buffer.alloc(0);

  constructor(options: NodeSerialConnectionOptions) {
    this.portPath = options.portPath;
    this.config = { ...DEFAULT_CONFIG, ...(options.config ?? {}) };
  }

  async connect(): Promise<void> {
    if (this.port) {
      return;
    }

    const port = new SerialPort({
      path: this.portPath,
      baudRate: this.config.baudRate,
      dataBits: this.config.dataBits,
      stopBits: this.config.stopBits,
      parity: this.config.parity,
      rtscts: this.config.flowControl === 'hardware',
      autoOpen: false
    });

    this.port = port;

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };

        const onOpen = () => {
          cleanup();
          port.on('data', (chunk: Buffer) => this.handleIncomingData(chunk));
          port.on('error', (err: Error) => {
            this.stopHeartbeat();
            console.error('Serial port error:', err);
          });
          resolve();
        };

        const cleanup = () => {
          port.removeListener('open', onOpen);
          port.removeListener('error', onError);
        };

        port.once('open', onOpen);
        port.once('error', onError);
        port.open();
      });
    } catch (error) {
      this.port = null;
      if (port.isOpen) {
        await new Promise<void>((resolve) => port.close(() => resolve()));
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();

    if (!this.port) {
      return;
    }

    const port = this.port;
    this.port = null;
    try {
      if (port.isOpen) {
        await new Promise<void>((resolve, reject) => {
          port.close((error) => error ? reject(error) : resolve());
        });
      }
    } finally {
      port.removeAllListeners('data');
      this.receiveBuffer = Buffer.alloc(0);
    }
  }

  async sendPacket(packet: number[] | Uint8Array): Promise<void> {
    if (!this.port) {
      throw new Error('Serial port not open');
    }

    const port = this.port;
    const data = packet instanceof Uint8Array ? packet : Uint8Array.from(packet);
    await new Promise<void>((resolve, reject) => {
      port.write(data, (error) => {
        if (error) return reject(error);
        port.drain((drainError) => drainError ? reject(drainError) : resolve());
      });
    });
  }

  registerPacketHandler(packetType: number, handler: PacketHandler): () => void {
    if (!this.packetHandlers.has(packetType)) {
      this.packetHandlers.set(packetType, []);
    }
    const handlers = this.packetHandlers.get(packetType)!;
    handlers.push(handler);

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

  registerRawDataHandler(handler: RawDataHandler): () => void {
    this.rawDataHandlers.add(handler);
    return () => {
      this.rawDataHandlers.delete(handler);
    };
  }

  registerPacketObserver(handler: PacketHandler): () => void {
    this.packetObservers.add(handler);
    return () => {
      this.packetObservers.delete(handler);
    };
  }

  waitForPacket(packetType: number, timeoutMs = 3000): Promise<number[] | null> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const unsubscribe = this.registerPacketHandler(packetType, (packet) => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        unsubscribe();
        resolve(packet);
      });

      timer = setTimeout(() => {
        unsubscribe();
        resolve(null);
      }, timeoutMs);
    });
  }

  startHeartbeat(generator: () => number[], intervalMs = 1000): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendPacket(generator()).catch((err) => console.error('Heartbeat failed:', err));
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleIncomingData(chunk: Buffer): void {
    for (const handler of this.rawDataHandlers) {
      try {
        handler(chunk);
      } catch (err) {
        console.error('Raw data handler error:', err);
      }
    }
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);
    this.processIncomingData();
  }

  private processIncomingData(): void {
    const { packets, remainder } = extractProtocolPackets(this.receiveBuffer);
    this.receiveBuffer = Buffer.from(remainder);
    for (const packet of packets) {
      this.handlePacket(packet);
    }
  }

  private handlePacket(packet: number[]): void {
    if (!packet || packet.length < 3) {
      return;
    }
    for (const handler of this.packetObservers) {
      try {
        handler(packet);
      } catch (err) {
        console.error('Packet observer error:', err);
      }
    }
    const packetType = packet[2];
    const handlers = this.packetHandlers.get(packetType) ?? [];
    for (const handler of handlers) {
      try {
        handler(packet);
      } catch (err) {
        console.error('Packet handler error:', err);
      }
    }
  }
}
