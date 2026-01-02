import { describe, it, expect } from 'vitest';
import { ContextRegistry, type DeviceContextParams } from '../src/context-registry';
import {
  createMockDevices,
  type MockDeviceConfig
} from './mocks/mock-serial';

describe('Device Selection', () => {
  describe('PSU selection with multiple devices', () => {
    it('should select correct PSU when using psu1', async () => {
      const configs: MockDeviceConfig[] = [
        {
          portPath: '/dev/ttyUSB0',
          deviceType: 'P906',
          channels: [{ channel: 0, voltage: 5.0, current: 1.0, temperature: 25, isOutput: false, online: true }]
        },
        {
          portPath: '/dev/ttyUSB1',
          deviceType: 'P906',
          channels: [{ channel: 0, voltage: 3.3, current: 0.5, temperature: 30, isOutput: true, online: true }]
        }
      ];

      const connections = createMockDevices(configs);
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'P906' }
      ];
      const registry = new ContextRegistry(contexts);

      // Get context for psu1
      const psu1Context = registry.getContext('psu1');
      expect(psu1Context).toBeDefined();
      expect(psu1Context!.portPath).toBe('/dev/ttyUSB0');

      // Get connection for psu1
      const psu1Connection = connections.get(psu1Context!.portPath);
      expect(psu1Connection).toBeDefined();

      // Verify it's the correct device
      await psu1Connection!.connect();
      const config = configs.find((c) => c.portPath === psu1Context!.portPath);
      expect(config?.channels?.[0].voltage).toBe(5.0);
    });

    it('should select correct PSU when using psu2', async () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'M01' }
      ];
      const registry = new ContextRegistry(contexts);

      // Get context for psu2
      const psu2Context = registry.getContext('psu2');
      expect(psu2Context).toBeDefined();
      expect(psu2Context!.portPath).toBe('/dev/ttyUSB1');
      expect(psu2Context!.machineType).toBe('M01');
    });
  });

  describe('Load selection with multiple devices', () => {
    it('should select correct Load when using load1', async () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'load', machineType: 'L1060' },
        { portPath: '/dev/ttyUSB1', category: 'load', machineType: 'L1060' }
      ];
      const registry = new ContextRegistry(contexts);

      const load1Context = registry.getContext('load1');
      expect(load1Context).toBeDefined();
      expect(load1Context!.portPath).toBe('/dev/ttyUSB0');
    });

    it('should select correct Load when using load2', async () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'load', machineType: 'L1060' },
        { portPath: '/dev/ttyUSB1', category: 'load', machineType: 'L1060' }
      ];
      const registry = new ContextRegistry(contexts);

      const load2Context = registry.getContext('load2');
      expect(load2Context).toBeDefined();
      expect(load2Context!.portPath).toBe('/dev/ttyUSB1');
    });
  });

  describe('Mixed PSU and Load selection', () => {
    it('should distinguish between PSU and Load with simple aliases', async () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'load', machineType: 'L1060' }
      ];
      const registry = new ContextRegistry(contexts);

      const psuContext = registry.getContext('psu');
      const loadContext = registry.getContext('load');

      expect(psuContext).toBeDefined();
      expect(loadContext).toBeDefined();
      expect(psuContext!.portPath).toBe('/dev/ttyUSB0');
      expect(loadContext!.portPath).toBe('/dev/ttyUSB1');
      expect(psuContext!.portPath).not.toBe(loadContext!.portPath);
    });

    it('should use numbered PSU aliases but simple Load alias', async () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'M01' },
        { portPath: '/dev/ttyUSB2', category: 'load', machineType: 'L1060' }
      ];
      const registry = new ContextRegistry(contexts);

      expect(registry.getContext('psu')).toBeUndefined();
      expect(registry.getContext('psu1')).toBeDefined();
      expect(registry.getContext('psu2')).toBeDefined();
      expect(registry.getContext('load')).toBeDefined();
      expect(registry.getContext('load1')).toBeUndefined();
    });

    it('should use simple PSU alias but numbered Load aliases', async () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'load', machineType: 'L1060' },
        { portPath: '/dev/ttyUSB2', category: 'load', machineType: 'L1060' }
      ];
      const registry = new ContextRegistry(contexts);

      expect(registry.getContext('psu')).toBeDefined();
      expect(registry.getContext('psu1')).toBeUndefined();
      expect(registry.getContext('load')).toBeUndefined();
      expect(registry.getContext('load1')).toBeDefined();
      expect(registry.getContext('load2')).toBeDefined();
    });
  });

  describe('Complex multi-device scenarios', () => {
    it('should handle 3 PSUs + 2 Loads correctly', async () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'M01' },
        { portPath: '/dev/ttyUSB2', category: 'psu', machineType: 'M02' },
        { portPath: '/dev/ttyUSB3', category: 'load', machineType: 'L1060' },
        { portPath: '/dev/ttyUSB4', category: 'load', machineType: 'L1060' }
      ];
      const registry = new ContextRegistry(contexts);

      // Verify all aliases exist
      expect(registry.getAliases()).toEqual(['load1', 'load2', 'psu1', 'psu2', 'psu3']);

      // Verify each alias points to correct port
      expect(registry.getContext('psu1')!.portPath).toBe('/dev/ttyUSB0');
      expect(registry.getContext('psu2')!.portPath).toBe('/dev/ttyUSB1');
      expect(registry.getContext('psu3')!.portPath).toBe('/dev/ttyUSB2');
      expect(registry.getContext('load1')!.portPath).toBe('/dev/ttyUSB3');
      expect(registry.getContext('load2')!.portPath).toBe('/dev/ttyUSB4');

      // Verify machine types are preserved
      expect(registry.getContext('psu1')!.machineType).toBe('P906');
      expect(registry.getContext('psu2')!.machineType).toBe('M01');
      expect(registry.getContext('psu3')!.machineType).toBe('M02');
    });

    it('should maintain device isolation across connections', async () => {
      const configs: MockDeviceConfig[] = [
        {
          portPath: '/dev/ttyUSB0',
          deviceType: 'P906',
          channels: [{ channel: 0, voltage: 5.0, current: 1.0, temperature: 25, isOutput: true, online: true }]
        },
        {
          portPath: '/dev/ttyUSB1',
          deviceType: 'L1060',
          channels: [{ channel: 0, voltage: 12.0, current: 3.0, temperature: 45, isOutput: true, online: true }]
        }
      ];

      const connections = createMockDevices(configs);

      const psuConnection = connections.get('/dev/ttyUSB0')!;
      const loadConnection = connections.get('/dev/ttyUSB1')!;

      await psuConnection.connect();
      await loadConnection.connect();

      // Verify connections are independent
      expect(psuConnection.isConnected()).toBe(true);
      expect(loadConnection.isConnected()).toBe(true);

      // Disconnect PSU
      await psuConnection.disconnect();
      expect(psuConnection.isConnected()).toBe(false);
      expect(loadConnection.isConnected()).toBe(true);

      // Disconnect Load
      await loadConnection.disconnect();
      expect(loadConnection.isConnected()).toBe(false);
    });
  });
});
