import assert from 'node:assert/strict';
import test from 'node:test';
import type { PacketHandler, Transport } from '../../packages/mdp-core/src/transport';
import { setOutputState, setTargets, type ProtocolModule } from '../src/controller';

class MockTransport implements Transport {
  public readonly sent: number[][] = [];
  private readonly packetQueue: number[][] = [];

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async sendPacket(packet: number[] | Uint8Array): Promise<void> {
    this.sent.push(Array.from(packet));
  }

  registerPacketHandler(packetType: number, handler: PacketHandler): () => void {
    return () => undefined;
  }

  async waitForPacket(packetType: number, timeoutMs?: number): Promise<number[] | null> {
    return this.packetQueue.shift() ?? null;
  }

  startHeartbeat(generator: () => number[], intervalMs?: number): void {}
  stopHeartbeat(): void {}

  queuePacket(packet: number[]): void {
    this.packetQueue.push(packet);
  }
}

const stubProtocol: ProtocolModule = {
  createGetMachinePacket: () => [],
  createHeartbeatPacket: () => [],
  createSetChannelPacket: (channel: number) => [0x5a, 0x5a, 0x19, 0x06, channel, 0],
  createSetVoltagePacket: () => [0x5a, 0x5a, 0x1a],
  createSetCurrentPacket: () => [0x5a, 0x5a, 0x1b],
  createSetOutputPacket: () => [0x5a, 0x5a, 0x16],
  decodePacket: () => null,
  processMachinePacket: () => null,
  processSynthesizePacket: () => [],
  PackType: {
    SYNTHESIZE: 0x11,
    MACHINE: 0x15,
    SET_ISOUTPUT: 0x16,
    SET_CH: 0x19,
    SET_V: 0x1a,
    SET_I: 0x1b
  }
};

test('setTargets sends channel + voltage/current packets', async () => {
  const transport = new MockTransport();
  await setTargets(transport, 1, 2.5, 0.3, undefined, stubProtocol);
  assert.strictEqual(transport.sent.length, 4);
  assert.strictEqual(transport.sent[0][2], 0x19);
  assert.strictEqual(transport.sent[1][2], 0x1a);
  assert.strictEqual(transport.sent[2][2], 0x19);
  assert.strictEqual(transport.sent[3][2], 0x1b);
});

test('setOutputState sends set channel and output packets', async () => {
  const transport = new MockTransport();
  await setOutputState(transport, 2, 'on', stubProtocol);
  assert.strictEqual(transport.sent.length, 2);
  assert.strictEqual(transport.sent[0][2], 0x19);
  assert.strictEqual(transport.sent[1][2], 0x16);
});
