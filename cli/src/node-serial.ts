import { SerialPort } from 'serialport';
import type { PacketHandler, SerialConfig } from '../../packages/mdp-core/src/transport';
import type { Transport } from '../../packages/mdp-core/src/transport';

const DEFAULT_CONFIG: SerialConfig = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none'
};

const MIN_PACKET_SIZE = 6;
const MAX_PACKET_SIZE = 255;
const MAX_BUFFER_SIZE = 2048;

export interface NodeSerialConnectionOptions {
  portPath: string;
  config?: Partial<SerialConfig>;
  serialPortFactory?: () => SerialPort;
}

export class NodeSerialConnection implements Transport {
  private readonly portPath: string;
  private readonly config: SerialConfig;
  private readonly serialPortFactory?: () => SerialPort;
  private port: SerialPort | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly packetHandlers = new Map<number, PacketHandler[]>();
  private receiveBuffer = Buffer.alloc(0);

  constructor(options: NodeSerialConnectionOptions) {
    this.portPath = options.portPath;
    this.config = { ...DEFAULT_CONFIG, ...(options.config ?? {}) };
    this.serialPortFactory = options.serialPortFactory;
  }

  async connect(): Promise<void> {
    if (this.port) {
      return;
    }

    const port =
      this.serialPortFactory?.() ??
      new SerialPort({
        path: this.portPath,
        baudRate: this.config.baudRate,
        dataBits: this.config.dataBits,
      stopBits: this.config.stopBits,
      parity: this.config.parity,
      rtscts: this.config.flowControl === 'hardware',
      autoOpen: false
    });

    this.port = port;

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onOpen = () => {
        cleanup();
        port.on('data', (chunk: Buffer) => this.handleIncomingData(chunk));
        port.on('error', (err: Error) => {
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
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();

    if (!this.port) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.port?.once('close', () => resolve());
      this.port?.close(() => resolve());
    });

    this.port = null;
    this.receiveBuffer = Buffer.alloc(0);
  }

  async sendPacket(packet: number[] | Uint8Array): Promise<void> {
    if (!this.port) {
      throw new Error('Serial port not open');
    }

    const data = packet instanceof Uint8Array ? packet : Uint8Array.from(packet);
    await new Promise<void>((resolve, reject) => {
      this.port?.write(data, (error) => {
        if (error) return reject(error);
        resolve();
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

  waitForPacket(packetType: number, timeoutMs = 3000): Promise<number[] | null> {
    return new Promise((resolve) => {
      let unsubscribe: () => void;

      const timer = setTimeout(() => {
        unsubscribe?.();
        resolve(null);
      }, timeoutMs);

      unsubscribe = this.registerPacketHandler(packetType, (packet) => {
        clearTimeout(timer);
        unsubscribe?.();
        resolve(packet);
      });
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
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);
    this.processIncomingData();
  }

  private processIncomingData(): void {
    if (this.receiveBuffer.length > MAX_BUFFER_SIZE) {
      // Keep only the latest bytes to avoid unbounded growth.
      this.receiveBuffer = this.receiveBuffer.slice(this.receiveBuffer.length - MAX_BUFFER_SIZE);
    }

    while (this.receiveBuffer.length >= 6) {
      const headerIndex = this.findHeader();
      if (headerIndex === -1) {
        if (this.receiveBuffer.length > 256) {
          this.receiveBuffer = Buffer.alloc(0);
        }
        break;
      }

      if (headerIndex > 0) {
        this.receiveBuffer = this.receiveBuffer.slice(headerIndex);
      }

      if (this.receiveBuffer.length < 4) {
        break;
      }

      const packetSize = this.receiveBuffer[3];
      if (packetSize < MIN_PACKET_SIZE || packetSize > MAX_PACKET_SIZE) {
        // Corrupted length field, drop a byte and try to resync.
        this.receiveBuffer = this.receiveBuffer.slice(1);
        continue;
      }
      if (this.receiveBuffer.length < packetSize) {
        break;
      }

      const packetBuffer = this.receiveBuffer.slice(0, packetSize);
      const numericPacket = Array.from(packetBuffer.values());
      this.handlePacket(numericPacket);
      this.receiveBuffer = this.receiveBuffer.slice(packetSize);
    }
  }

  private findHeader(): number {
    for (let i = 0; i <= this.receiveBuffer.length - 2; i++) {
      if (this.receiveBuffer[i] === 0x5A && this.receiveBuffer[i + 1] === 0x5A) {
        return i;
      }
    }
    return -1;
  }

  private handlePacket(packet: number[]): void {
    if (!packet || packet.length < 3) {
      return;
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
