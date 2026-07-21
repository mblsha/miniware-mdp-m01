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
import { requestChannelStatus, requestPacket } from '../src/device-requests';
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
    });
    await connection.connect();

    const status = await requestChannelStatus(connection, 0, 50);

    expect(status).toMatchObject({ channel: 0, online: true, isOutput: true, voltage: 4.2 });
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

    await expect(requestChannelStatus(connection, 99, 50)).resolves.toBeNull();
  });
});
