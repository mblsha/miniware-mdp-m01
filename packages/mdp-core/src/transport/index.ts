export type PacketHandler = (packet: number[]) => void;

export interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendPacket(packet: number[] | Uint8Array): Promise<void>;
  registerPacketHandler(packetType: number, handler: PacketHandler): () => void;
  waitForPacket(packetType: number, timeoutMs?: number): Promise<number[] | null>;
  startHeartbeat(generator: () => number[], intervalMs?: number): void;
  stopHeartbeat(): void;
}
