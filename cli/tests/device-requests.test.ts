import { describe, expect, it, vi } from 'vitest';

vi.mock('../../webui/src/lib/packet-decoder', () => ({
  decodePacket: (packet: number[]) => packet,
  processSynthesizePacket: () => [{
    channel: 0,
    online: true,
    isOutput: true,
    voltage: 4.2,
    current: 0.5,
    targetVoltage: 4.2,
    targetCurrent: 0.5,
    machineType: 'P906',
  }],
}));
import {
  requestChannelStatus,
  requestPacket,
  requestSynthesizeChannels,
  requestSynthesizeChannelsWithRetry
} from '../src/device-requests';
import { PackType } from '../src/packet-types';
import { createGetMachinePacket } from '../../webui/src/lib/packet-encoder';
import {
  createMachineResponse,
  MockNodeSerialConnection,
} from './mocks/mock-serial';

describe('device request sequencing', () => {
  it('installs the synthesize waiter before sending a heartbeat', async () => {
    const connection = new MockNodeSerialConnection({
      portPath: '/dev/mock',
      deviceType: 'P906',
      channels: [{
        channel: 0,
        voltage: 4.2,
        current: 0.5,
        temperature: 25,
        isOutput: true,
        online: true,
      }],
      synthesizeEveryCommands: 3,
    });
    await connection.connect();

    const status = await requestChannelStatus(connection, 0, 50, 1);

    expect(status).toMatchObject({ channel: 0, online: true, isOutput: true, voltage: 4.2 });
    expect(connection.getSentPackets().map((packet) => packet[2])).toEqual([
      PackType.HEARTBEAT,
      PackType.HEARTBEAT,
      PackType.HEARTBEAT,
    ]);
  });

  it('does not assume one heartbeat has a one-to-one synthesize response', async () => {
    const connection = new MockNodeSerialConnection({
      portPath: '/dev/mock',
      deviceType: 'P906',
      synthesizeEveryCommands: 4,
    });
    await connection.connect();

    await expect(requestSynthesizeChannels(connection, 50, 1)).resolves.not.toBeNull();
    expect(connection.getSentPackets()).toHaveLength(4);
  });

  it('captures an immediate machine response', async () => {
    const response = createMachineResponse('M01');
    let waiterInstalled = false;
    const connection = {
      waitForPacket: async () => {
        waiterInstalled = true;
        return response;
      },
      sendPacket: async () => {
        expect(waiterInstalled).toBe(true);
      },
    };

    await expect(requestPacket(
      connection,
      PackType.MACHINE,
      createGetMachinePacket(),
      50
    )).resolves.toEqual(response);
  });

  it('returns null when the requested channel is absent', async () => {
    const packet = [0x5A, 0x5A, PackType.SYNTHESIZE, 156];
    const connection = {
      waitForPacket: async () => packet,
      sendPacket: async () => undefined,
    };

    await expect(requestChannelStatus(connection, 5, 50, 1)).resolves.toBeNull();
  });

  it('rejects an unsafe channel before probing the device', async () => {
    const sendPacket = vi.fn(async () => undefined);
    const connection = {
      waitForPacket: async () => null,
      sendPacket,
    };

    await expect(requestChannelStatus(connection, 0xEE, 50, 1)).rejects.toThrow(
      'Channel must be an integer between 0 and 5'
    );
    expect(sendPacket).not.toHaveBeenCalled();
  });

  it('retries transiently missing synthesize status before device selection', async () => {
    const packet = [0x5A, 0x5A, PackType.SYNTHESIZE, 156];
    let waits = 0;
    const connection = {
      waitForPacket: async () => {
        waits += 1;
        return waits < 3 ? null : packet;
      },
      sendPacket: async () => undefined,
    };

    await expect(
      requestSynthesizeChannelsWithRetry(connection, 50, 3, 1)
    ).resolves.toEqual([
      expect.objectContaining({
        channel: 0,
        machineType: 'P906',
      }),
    ]);
    expect(waits).toBe(3);
  });

  it('rejects an invalid synthesize retry count', async () => {
    const connection = {
      waitForPacket: async () => null,
      sendPacket: async () => undefined,
    };

    await expect(
      requestSynthesizeChannelsWithRetry(connection, 50, 0)
    ).rejects.toThrow('positive integer');
  });
});
