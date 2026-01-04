import type { PacketHandler, RawDataHandler } from '../../webui/src/lib/types';

export class ReplaySerialConnection {
  private readonly packetHandlers = new Map<number, PacketHandler[]>();
  private readonly packetObservers = new Set<PacketHandler>();
  private readonly rawDataHandlers = new Set<RawDataHandler>();
  private receiveBuffer = Buffer.alloc(0);

  async connect(): Promise<void> {
    // No-op for replay.
  }

  async disconnect(): Promise<void> {
    this.receiveBuffer = Buffer.alloc(0);
  }

  async sendPacket(_packet: number[] | Uint8Array): Promise<void> {
    // No-op for replay.
  }

  startHeartbeat(_generator: () => number[], _intervalMs = 1000): void {
    // No-op for replay.
  }

  stopHeartbeat(): void {
    // No-op for replay.
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

  ingestChunk(chunk: Uint8Array): void {
    const buffer = Buffer.from(chunk);
    for (const handler of this.rawDataHandlers) {
      try {
        handler(buffer);
      } catch (err) {
        console.error('Raw data handler error:', err);
      }
    }
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, buffer]);
    this.processIncomingData();
  }

  private processIncomingData(): void {
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
      if (packetSize < 6) {
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
