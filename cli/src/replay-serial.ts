import type { PacketHandler, RawDataHandler } from './serial-types';
import { extractProtocolPackets } from '../../webui/src/lib/protocol';

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
    const { frames, remainder } = extractProtocolPackets(this.receiveBuffer);
    this.receiveBuffer = Buffer.from(remainder);
    for (const frame of frames) {
      this.observePacket(frame.packet);
      if (frame.accepted) {
        this.dispatchPacket(frame.packet);
      }
    }
  }

  private observePacket(packet: number[]): void {
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
  }

  private dispatchPacket(packet: number[]): void {
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
