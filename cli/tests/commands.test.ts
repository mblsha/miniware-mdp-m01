import { describe, it, expect } from 'vitest';
import { ContextRegistry, type DeviceContextParams } from '../src/context-registry';
import {
  createMockDevices,
  type MockDeviceConfig
} from './mocks/mock-serial';
import {
  createSetVoltagePacket,
  createSetCurrentPacket,
  createHeartbeatPacket
} from '../../webui/src/lib/packet-encoder';
import {
  executeOutputCommand,
  executeSetpointCommand
} from '../../webui/src/lib/command-executor';

describe('Command Handler Tests', () => {
  describe('Set Voltage Command', () => {
    it('should send one SET_V packet to the correct PSU without changing selection', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' },
        { portPath: '/dev/ttyUSB1', deviceType: 'P906' }
      ];
      const connections = createMockDevices(configs);
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'P906' }
      ];
      const registry = new ContextRegistry(contexts);

      // Target psu1
      const psu1Context = registry.getContext('psu1')!;
      const psu1Connection = connections.get(psu1Context.portPath)!;
      const psu2Connection = connections.get('/dev/ttyUSB1')!;

      await psu1Connection.connect();
      await psu2Connection.connect();

      // Clear any initial packets
      psu1Connection.clearSentPackets();
      psu2Connection.clearSentPackets();

      // Simulate sending set voltage command to psu1, channel 0
      const channel = 0;
      const voltage = 5.0;
      const current = 1.0;

      await executeSetpointCommand(psu1Connection, channel, voltage, current, 'voltage');

      // Verify packets were sent to psu1
      const psu1Packets = psu1Connection.getSentPackets();
      expect(psu1Packets).toHaveLength(1);

      // Verify SET_V packet (0x1A)
      expect(psu1Packets[0][2]).toBe(0x1a);
      expect(psu1Packets[0][4]).toBe(channel);

      // Verify voltage/current in packet data (little-endian)
      const voltageMv = voltage * 1000;
      const currentMa = current * 1000;
      expect(psu1Packets[0][6]).toBe(voltageMv & 0xff);
      expect(psu1Packets[0][7]).toBe((voltageMv >> 8) & 0xff);
      expect(psu1Packets[0][8]).toBe(currentMa & 0xff);
      expect(psu1Packets[0][9]).toBe((currentMa >> 8) & 0xff);

      // Verify NO packets sent to psu2
      const psu2Packets = psu2Connection.getSentPackets();
      expect(psu2Packets).toHaveLength(0);

      await psu1Connection.disconnect();
      await psu2Connection.disconnect();
    });

    it('should send SET_V to correct channel on multi-channel device', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' }
      ];
      const connections = createMockDevices(configs);
      const psuConnection = connections.get('/dev/ttyUSB0')!;

      await psuConnection.connect();
      psuConnection.clearSentPackets();

      // Send to channel 3
      const channel = 3;
      const voltage = 12.0;
      const current = 2.0;

      await executeSetpointCommand(psuConnection, channel, voltage, current, 'voltage');

      const packets = psuConnection.getSentPackets();
      expect(packets).toHaveLength(1);

      expect(packets[0][4]).toBe(3);

      await psuConnection.disconnect();
    });
  });

  describe('Set Current Command', () => {
    it('should send one SET_I packet to the correct Load', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'L1060' },
        { portPath: '/dev/ttyUSB1', deviceType: 'L1060' }
      ];
      const connections = createMockDevices(configs);
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'load', machineType: 'L1060' },
        { portPath: '/dev/ttyUSB1', category: 'load', machineType: 'L1060' }
      ];
      const registry = new ContextRegistry(contexts);

      // Target load2
      const load2Context = registry.getContext('load2')!;
      const load2Connection = connections.get(load2Context.portPath)!;
      const load1Connection = connections.get('/dev/ttyUSB0')!;

      await load1Connection.connect();
      await load2Connection.connect();

      load1Connection.clearSentPackets();
      load2Connection.clearSentPackets();

      const channel = 0;
      const voltage = 12.0;
      const current = 3.0;

      await executeSetpointCommand(load2Connection, channel, voltage, current, 'current');

      // Verify packets sent to load2
      const load2Packets = load2Connection.getSentPackets();
      expect(load2Packets).toHaveLength(1);

      // Verify SET_I packet (0x1B)
      expect(load2Packets[0][2]).toBe(0x1b);

      // Verify current in packet
      const currentMa = current * 1000;
      expect(load2Packets[0][8]).toBe(currentMa & 0xff);
      expect(load2Packets[0][9]).toBe((currentMa >> 8) & 0xff);

      // Verify NO packets sent to load1
      expect(load1Connection.getSentPackets()).toHaveLength(0);

      await load1Connection.disconnect();
      await load2Connection.disconnect();
    });
  });

  describe('Output On/Off Command', () => {
    it('should send one SET_ISOUTPUT ON to the correct PSU', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' },
        { portPath: '/dev/ttyUSB1', deviceType: 'L1060' }
      ];
      const connections = createMockDevices(configs);
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'load', machineType: 'L1060' }
      ];
      const registry = new ContextRegistry(contexts);

      const psuContext = registry.getContext('psu')!;
      const psuConnection = connections.get(psuContext.portPath)!;
      const loadConnection = connections.get('/dev/ttyUSB1')!;

      await psuConnection.connect();
      await loadConnection.connect();

      psuConnection.clearSentPackets();
      loadConnection.clearSentPackets();

      const channel = 0;
      await executeOutputCommand(psuConnection, channel, true);

      const psuPackets = psuConnection.getSentPackets();
      expect(psuPackets).toHaveLength(1);

      // Verify SET_ISOUTPUT packet (0x16)
      expect(psuPackets[0][2]).toBe(0x16);
      expect(psuPackets[0][6]).toBe(1); // ON

      // Verify Load was not affected
      expect(loadConnection.getSentPackets()).toHaveLength(0);

      await psuConnection.disconnect();
      await loadConnection.disconnect();
    });

    it('should send SET_ISOUTPUT OFF correctly', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' }
      ];
      const connections = createMockDevices(configs);
      const psuConnection = connections.get('/dev/ttyUSB0')!;

      await psuConnection.connect();
      psuConnection.clearSentPackets();

      const channel = 2;
      await executeOutputCommand(psuConnection, channel, false);

      const packets = psuConnection.getSentPackets();
      expect(packets).toHaveLength(1);

      // Verify SET_ISOUTPUT OFF
      expect(packets[0][2]).toBe(0x16);
      expect(packets[0][4]).toBe(channel);
      expect(packets[0][6]).toBe(0); // OFF

      await psuConnection.disconnect();
    });

    it('should send ON to Load and not PSU', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' },
        { portPath: '/dev/ttyUSB1', deviceType: 'L1060' }
      ];
      const connections = createMockDevices(configs);
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'load', machineType: 'L1060' }
      ];
      const registry = new ContextRegistry(contexts);

      const loadContext = registry.getContext('load')!;
      const loadConnection = connections.get(loadContext.portPath)!;
      const psuConnection = connections.get('/dev/ttyUSB0')!;

      await psuConnection.connect();
      await loadConnection.connect();

      psuConnection.clearSentPackets();
      loadConnection.clearSentPackets();

      const channel = 0;
      await executeOutputCommand(loadConnection, channel, true);

      // Verify Load received the packets
      const loadPackets = loadConnection.getSentPackets();
      expect(loadPackets).toHaveLength(1);
      expect(loadPackets[0][2]).toBe(0x16);
      expect(loadPackets[0][6]).toBe(1);

      // Verify PSU was NOT affected
      expect(psuConnection.getSentPackets()).toHaveLength(0);

      await psuConnection.disconnect();
      await loadConnection.disconnect();
    });
  });

  describe('Channel Selection', () => {
    it('should target channel 0 by default', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' }
      ];
      const connections = createMockDevices(configs);
      const psuConnection = connections.get('/dev/ttyUSB0')!;

      await psuConnection.connect();
      psuConnection.clearSentPackets();

      await executeSetpointCommand(psuConnection, 0, 5.0, 1.0, 'voltage');

      const packets = psuConnection.getSentPackets();
      expect(packets).toHaveLength(1);
      expect(packets[0][4]).toBe(0);

      await psuConnection.disconnect();
    });

    it('should target specified channel (1-5)', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' }
      ];
      const connections = createMockDevices(configs);
      const psuConnection = connections.get('/dev/ttyUSB0')!;

      await psuConnection.connect();

      for (let ch = 0; ch <= 5; ch++) {
        psuConnection.clearSentPackets();

        await executeOutputCommand(psuConnection, ch, true);

        const packets = psuConnection.getSentPackets();
        expect(packets[0][4]).toBe(ch);
      }

      await psuConnection.disconnect();
    });

    it('should reject broadcast and out-of-range channel indexes before sending', async () => {
      const connections = createMockDevices([
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' }
      ]);
      const connection = connections.get('/dev/ttyUSB0')!;
      await connection.connect();

      await expect(executeOutputCommand(connection, 0xEE, true)).rejects.toThrow('between 0 and 5');
      await expect(
        executeSetpointCommand(connection, -1, 5, 1, 'voltage')
      ).rejects.toThrow('between 0 and 5');
      expect(connection.getSentPackets()).toHaveLength(0);

      await connection.disconnect();
    });
  });

  describe('Device Isolation', () => {
    it('should not leak commands between PSUs', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' },
        { portPath: '/dev/ttyUSB1', deviceType: 'P906' },
        { portPath: '/dev/ttyUSB2', deviceType: 'P906' }
      ];
      const connections = createMockDevices(configs);

      const psu1Connection = connections.get('/dev/ttyUSB0')!;
      const psu2Connection = connections.get('/dev/ttyUSB1')!;
      const psu3Connection = connections.get('/dev/ttyUSB2')!;

      await psu1Connection.connect();
      await psu2Connection.connect();
      await psu3Connection.connect();

      psu1Connection.clearSentPackets();
      psu2Connection.clearSentPackets();
      psu3Connection.clearSentPackets();

      // Send command to psu2 only
      await executeSetpointCommand(psu2Connection, 0, 5.0, 1.0, 'voltage');

      // Verify only psu2 received packets
      expect(psu1Connection.getSentPackets()).toHaveLength(0);
      expect(psu2Connection.getSentPackets()).toHaveLength(1);
      expect(psu3Connection.getSentPackets()).toHaveLength(0);

      await psu1Connection.disconnect();
      await psu2Connection.disconnect();
      await psu3Connection.disconnect();
    });

    it('should not leak commands between Load and PSU', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' },
        { portPath: '/dev/ttyUSB1', deviceType: 'L1060' }
      ];
      const connections = createMockDevices(configs);

      const psuConnection = connections.get('/dev/ttyUSB0')!;
      const loadConnection = connections.get('/dev/ttyUSB1')!;

      await psuConnection.connect();
      await loadConnection.connect();

      psuConnection.clearSentPackets();
      loadConnection.clearSentPackets();

      // Send voltage to PSU
      await psuConnection.sendPacket(createSetVoltagePacket(0, 5.0, 1.0));

      // Send current to Load
      await loadConnection.sendPacket(createSetCurrentPacket(0, 12.0, 3.0));

      // Verify isolation
      const psuPackets = psuConnection.getSentPackets();
      const loadPackets = loadConnection.getSentPackets();

      expect(psuPackets).toHaveLength(1);
      expect(loadPackets).toHaveLength(1);

      // PSU got SET_V (0x1A)
      expect(psuPackets[0][2]).toBe(0x1a);

      // Load got SET_I (0x1B)
      expect(loadPackets[0][2]).toBe(0x1b);

      await psuConnection.disconnect();
      await loadConnection.disconnect();
    });
  });

  describe('Heartbeat Command', () => {
    it('should send heartbeat to specific device', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' },
        { portPath: '/dev/ttyUSB1', deviceType: 'L1060' }
      ];
      const connections = createMockDevices(configs);

      const psuConnection = connections.get('/dev/ttyUSB0')!;
      const loadConnection = connections.get('/dev/ttyUSB1')!;

      await psuConnection.connect();
      await loadConnection.connect();

      psuConnection.clearSentPackets();
      loadConnection.clearSentPackets();

      // Send heartbeat to PSU
      await psuConnection.sendPacket(createHeartbeatPacket());

      // Verify only PSU received heartbeat
      const psuPackets = psuConnection.getSentPackets();
      expect(psuPackets).toHaveLength(1);
      expect(psuPackets[0][2]).toBe(0x22); // HEARTBEAT

      expect(loadConnection.getSentPackets()).toHaveLength(0);

      await psuConnection.disconnect();
      await loadConnection.disconnect();
    });
  });

  describe('Packet Data Encoding', () => {
    it('should encode voltage/current correctly in little-endian', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' }
      ];
      const connections = createMockDevices(configs);
      const psuConnection = connections.get('/dev/ttyUSB0')!;

      await psuConnection.connect();
      psuConnection.clearSentPackets();

      // Test with values that span multiple bytes
      const voltage = 12.345; // 12345 mV
      const current = 3.456; // 3456 mA

      await psuConnection.sendPacket(createSetVoltagePacket(0, voltage, current));

      const packets = psuConnection.getSentPackets();
      const voltagePacket = packets[0];

      // Voltage in little-endian (12345 = 0x3039)
      const voltageMv = Math.round(voltage * 1000);
      expect(voltagePacket[6]).toBe(voltageMv & 0xff); // 0x39
      expect(voltagePacket[7]).toBe((voltageMv >> 8) & 0xff); // 0x30

      // Current in little-endian (3456 = 0x0D80)
      const currentMa = Math.round(current * 1000);
      expect(voltagePacket[8]).toBe(currentMa & 0xff); // 0x80
      expect(voltagePacket[9]).toBe((currentMa >> 8) & 0xff); // 0x0D

      await psuConnection.disconnect();
    });

    it('should handle zero values correctly', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' }
      ];
      const connections = createMockDevices(configs);
      const psuConnection = connections.get('/dev/ttyUSB0')!;

      await psuConnection.connect();
      psuConnection.clearSentPackets();

      await psuConnection.sendPacket(createSetVoltagePacket(0, 0, 0));

      const packets = psuConnection.getSentPackets();
      const voltagePacket = packets[0];

      expect(voltagePacket[6]).toBe(0);
      expect(voltagePacket[7]).toBe(0);
      expect(voltagePacket[8]).toBe(0);
      expect(voltagePacket[9]).toBe(0);

      await psuConnection.disconnect();
    });

    it('should handle maximum values correctly', async () => {
      const configs: MockDeviceConfig[] = [
        { portPath: '/dev/ttyUSB0', deviceType: 'P906' }
      ];
      const connections = createMockDevices(configs);
      const psuConnection = connections.get('/dev/ttyUSB0')!;

      await psuConnection.connect();
      psuConnection.clearSentPackets();

      // Maximum 16-bit value / 1000 = 65.535
      const maxVoltage = 65.535;
      const maxCurrent = 65.535;

      await psuConnection.sendPacket(createSetVoltagePacket(0, maxVoltage, maxCurrent));

      const packets = psuConnection.getSentPackets();
      const voltagePacket = packets[0];

      // 65535 = 0xFFFF
      expect(voltagePacket[6]).toBe(0xff);
      expect(voltagePacket[7]).toBe(0xff);
      expect(voltagePacket[8]).toBe(0xff);
      expect(voltagePacket[9]).toBe(0xff);

      await psuConnection.disconnect();
    });
  });
});
