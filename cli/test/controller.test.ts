import assert from 'node:assert/strict';
import test from 'node:test';
import type { PacketHandler, Transport } from '../../packages/mdp-core/src/transport';
import {
  detectMachineTypeFromSynthesize,
  setOutputState,
  setTargets,
  waitForChannelStatus,
  type ProtocolModule
} from '../src/controller';
import type { ChannelUpdate } from '../../packages/mdp-core/src/protocol';

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

const channelUpdates: ChannelUpdate[] = [
  { channel: 0, online: true, machineType: 'P906', voltage: 3.3, current: 0.5, power: 0, temperature: 25, isOutput: true, mode: 'CV', address: [], targetVoltage: 3.3, targetCurrent: 0.5, targetPower: 0, inputVoltage: 0, inputCurrent: 0 },
  { channel: 1, online: true, machineType: 'P906', voltage: 1, current: 0.1, power: 0, temperature: 23, isOutput: false, mode: 'CC', address: [], targetVoltage: 1, targetCurrent: 0.1, targetPower: 0 }
];

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
  await setTargets(transport, 1, 2.5, 0.3, undefined, stubProtocol, async () => {});
  assert.strictEqual(transport.sent.length, 4);
  assert.strictEqual(transport.sent[0][2], 0x19);
  assert.strictEqual(transport.sent[1][2], 0x1a);
  assert.strictEqual(transport.sent[2][2], 0x19);
  assert.strictEqual(transport.sent[3][2], 0x1b);
});

test('setTargets uses baseline to fill missing target values', async () => {
  const transport = new MockTransport();
  await setTargets(transport, 0, undefined, 0.4, channelUpdates[0], stubProtocol, async () => {});
  assert.strictEqual(transport.sent.length, 2);
  assert.strictEqual(transport.sent[0][2], 0x19);
  assert.strictEqual(transport.sent[1][2], 0x1b);
});

test('setOutputState sends set channel and output packets', async () => {
  const transport = new MockTransport();
  await setOutputState(transport, 2, 'on', stubProtocol, async () => {});
  assert.strictEqual(transport.sent.length, 2);
  assert.strictEqual(transport.sent[0][2], 0x19);
  assert.strictEqual(transport.sent[1][2], 0x16);
});

test('waitForChannelStatus returns requested channel update', async () => {
  const transport = new MockTransport();
  transport.queuePacket([0x5a, 0x5a, 0x11, 0x06, 0x00, 0x00]);

  const protocol: ProtocolModule = {
    ...stubProtocol,
    decodePacket: () => ({ packType: 0x11, size: 0, data: {} }),
    processSynthesizePacket: () => channelUpdates
  };

  const result = await waitForChannelStatus(transport, 1, 1000, protocol);
  assert.strictEqual(result?.channel, 1);
});

test('waitForChannelStatus falls back to first channel when requested index is missing', async () => {
  const transport = new MockTransport();
  transport.queuePacket([0x5a, 0x5a, 0x11, 0x06, 0x00, 0x00]);

  const protocol: ProtocolModule = {
    ...stubProtocol,
    decodePacket: () => ({ packType: 0x11, size: 0, data: {} }),
    processSynthesizePacket: () => [channelUpdates[0]]
  };

  const result = await waitForChannelStatus(transport, 2, 1000, protocol);
  assert.strictEqual(result?.channel, 0);
});

test('detectMachineTypeFromSynthesize returns machine type string', async () => {
  const transport = new MockTransport();
  transport.queuePacket([0x5a, 0x5a, 0x11, 0x06, 0x00, 0x00]);

  const protocol: ProtocolModule = {
    ...stubProtocol,
    decodePacket: () => ({ packType: 0x11, size: 0, data: {} }),
    processSynthesizePacket: () => channelUpdates
  };

  const type = await detectMachineTypeFromSynthesize(transport, 1000, protocol);
  assert.strictEqual(type, 'P906');
});

test('detectMachineTypeFromSynthesize returns null when no packet arrives', async () => {
  const transport = new MockTransport();
  const result = await detectMachineTypeFromSynthesize(transport, 100, stubProtocol);
  assert.strictEqual(result, null);
});

test('detectMachineTypeFromSynthesize swallows heartbeat send failures', async () => {
  class FailingSendTransport extends MockTransport {
    async sendPacket(): Promise<void> {
      throw new Error('oops');
    }
  }

  const transport = new FailingSendTransport();
  const result = await detectMachineTypeFromSynthesize(transport, 100, stubProtocol);
  assert.strictEqual(result, null);
});
