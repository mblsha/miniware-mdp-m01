import { describe, it, expect } from 'vitest';
import {
  ContextRegistry,
  categorizeDevice,
  type DeviceContextParams
} from '../src/context-registry';

describe('categorizeDevice', () => {
  it('should categorize L1060 as load', () => {
    expect(categorizeDevice('L1060')).toBe('load');
    expect(categorizeDevice('l1060')).toBe('load');
    expect(categorizeDevice('Device L1060')).toBe('load');
  });

  it('should categorize P906 as psu', () => {
    expect(categorizeDevice('P906')).toBe('psu');
    expect(categorizeDevice('p906')).toBe('psu');
  });

  it('should categorize M01 as psu', () => {
    expect(categorizeDevice('M01')).toBe('psu');
    expect(categorizeDevice('M01 with LCD')).toBe('psu');
  });

  it('should categorize M02 as psu', () => {
    expect(categorizeDevice('M02')).toBe('psu');
    expect(categorizeDevice('M02 without LCD')).toBe('psu');
  });

  it('should categorize unknown devices as psu', () => {
    expect(categorizeDevice('Unknown')).toBe('psu');
    expect(categorizeDevice('')).toBe('psu');
  });
});

describe('ContextRegistry', () => {
  describe('single device scenarios', () => {
    it('should assign simple "psu" alias for single PSU', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' }
      ];

      const registry = new ContextRegistry(contexts);

      expect(registry.getAliases()).toEqual(['psu']);
      expect(registry.getContext('psu')).toEqual({
        portPath: '/dev/ttyUSB0',
        category: 'psu',
        machineType: 'P906',
        alias: 'psu',
        index: 1
      });
      expect(registry.getAmbiguousCategories()).toEqual([]);
    });

    it('should assign simple "load" alias for single Load', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'load', machineType: 'L1060' }
      ];

      const registry = new ContextRegistry(contexts);

      expect(registry.getAliases()).toEqual(['load']);
      expect(registry.getContext('load')).toEqual({
        portPath: '/dev/ttyUSB0',
        category: 'load',
        machineType: 'L1060',
        alias: 'load',
        index: 1
      });
      expect(registry.getAmbiguousCategories()).toEqual([]);
    });
  });

  describe('multiple devices of same category', () => {
    it('should assign numbered aliases for two PSUs', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'P906' }
      ];

      const registry = new ContextRegistry(contexts);

      expect(registry.getAliases()).toEqual(['psu1', 'psu2']);
      expect(registry.getContext('psu1')?.portPath).toBe('/dev/ttyUSB0');
      expect(registry.getContext('psu2')?.portPath).toBe('/dev/ttyUSB1');
      expect(registry.getContext('psu')).toBeUndefined();
      expect(registry.getAmbiguousCategories()).toEqual(['psu']);
    });

    it('should assign numbered aliases for three PSUs', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'M01' },
        { portPath: '/dev/ttyUSB2', category: 'psu', machineType: 'M02' }
      ];

      const registry = new ContextRegistry(contexts);

      expect(registry.getAliases()).toEqual(['psu1', 'psu2', 'psu3']);
      expect(registry.getContext('psu1')?.machineType).toBe('P906');
      expect(registry.getContext('psu2')?.machineType).toBe('M01');
      expect(registry.getContext('psu3')?.machineType).toBe('M02');
    });

    it('should assign numbered aliases for two Loads', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'load', machineType: 'L1060' },
        { portPath: '/dev/ttyUSB1', category: 'load', machineType: 'L1060' }
      ];

      const registry = new ContextRegistry(contexts);

      expect(registry.getAliases()).toEqual(['load1', 'load2']);
      expect(registry.getContext('load1')?.portPath).toBe('/dev/ttyUSB0');
      expect(registry.getContext('load2')?.portPath).toBe('/dev/ttyUSB1');
      expect(registry.getContext('load')).toBeUndefined();
      expect(registry.getAmbiguousCategories()).toEqual(['load']);
    });
  });

  describe('mixed device combinations', () => {
    it('should handle 1 PSU + 1 Load', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'load', machineType: 'L1060' }
      ];

      const registry = new ContextRegistry(contexts);

      expect(registry.getAliases()).toEqual(['load', 'psu']);
      expect(registry.getContext('psu')?.portPath).toBe('/dev/ttyUSB0');
      expect(registry.getContext('load')?.portPath).toBe('/dev/ttyUSB1');
      expect(registry.getAmbiguousCategories()).toEqual([]);
    });

    it('should handle 2 PSUs + 1 Load', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'M01' },
        { portPath: '/dev/ttyUSB2', category: 'load', machineType: 'L1060' }
      ];

      const registry = new ContextRegistry(contexts);

      expect(registry.getAliases()).toEqual(['load', 'psu1', 'psu2']);
      expect(registry.getContext('psu1')?.machineType).toBe('P906');
      expect(registry.getContext('psu2')?.machineType).toBe('M01');
      expect(registry.getContext('load')?.machineType).toBe('L1060');
      expect(registry.getContext('psu')).toBeUndefined();
      expect(registry.getAmbiguousCategories()).toEqual(['psu']);
    });

    it('should handle 1 PSU + 2 Loads', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'load', machineType: 'L1060' },
        { portPath: '/dev/ttyUSB2', category: 'load', machineType: 'L1060' }
      ];

      const registry = new ContextRegistry(contexts);

      expect(registry.getAliases()).toEqual(['load1', 'load2', 'psu']);
      expect(registry.getContext('psu')?.machineType).toBe('P906');
      expect(registry.getContext('load1')?.portPath).toBe('/dev/ttyUSB1');
      expect(registry.getContext('load2')?.portPath).toBe('/dev/ttyUSB2');
      expect(registry.getContext('load')).toBeUndefined();
      expect(registry.getAmbiguousCategories()).toEqual(['load']);
    });

    it('should handle 2 PSUs + 2 Loads', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'M01' },
        { portPath: '/dev/ttyUSB2', category: 'load', machineType: 'L1060' },
        { portPath: '/dev/ttyUSB3', category: 'load', machineType: 'L1060' }
      ];

      const registry = new ContextRegistry(contexts);

      expect(registry.getAliases()).toEqual(['load1', 'load2', 'psu1', 'psu2']);
      expect(registry.getContext('psu')).toBeUndefined();
      expect(registry.getContext('load')).toBeUndefined();
      expect(registry.getAmbiguousCategories()).toContain('psu');
      expect(registry.getAmbiguousCategories()).toContain('load');
    });
  });

  describe('empty registry', () => {
    it('should handle no devices', () => {
      const registry = new ContextRegistry([]);

      expect(registry.getAliases()).toEqual([]);
      expect(registry.getAmbiguousCategories()).toEqual([]);
      expect(registry.getContext('psu')).toBeUndefined();
      expect(registry.getContext('load')).toBeUndefined();
    });
  });

  describe('uniqueContextsByCategory', () => {
    it('should track PSUs separately from Loads', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'load', machineType: 'L1060' }
      ];

      const registry = new ContextRegistry(contexts);

      expect(registry.uniqueContextsByCategory.psu).toHaveLength(1);
      expect(registry.uniqueContextsByCategory.load).toHaveLength(1);
      expect(registry.uniqueContextsByCategory.psu[0].machineType).toBe('P906');
      expect(registry.uniqueContextsByCategory.load[0].machineType).toBe('L1060');
    });

    it('should not duplicate entries', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'M01' }
      ];

      const registry = new ContextRegistry(contexts);

      expect(registry.uniqueContextsByCategory.psu).toHaveLength(2);
      expect(registry.uniqueContextsByCategory.load).toHaveLength(0);
    });
  });

  describe('describe()', () => {
    it('should generate readable description for single PSU', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' }
      ];

      const registry = new ContextRegistry(contexts);
      const description = registry.describe();

      expect(description).toContain('Detected device contexts:');
      expect(description).toContain('  psu -> PSU (P906)');
    });

    it('should include ambiguous hints for multiple PSUs', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'M01' }
      ];

      const registry = new ContextRegistry(contexts);
      const description = registry.describe();

      expect(description).toContain('Detected device contexts:');
      expect(description).toContain('  psu1 -> PSU (P906)');
      expect(description).toContain('  psu2 -> PSU (M01)');
      expect(description).toContain('Ambiguous names:');
      expect(description).toContain('  psu (use psu1, psu2)');
    });

    it('should include both PSU and Load ambiguous hints', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'M01' },
        { portPath: '/dev/ttyUSB2', category: 'load', machineType: 'L1060' },
        { portPath: '/dev/ttyUSB3', category: 'load', machineType: 'L1060' }
      ];

      const registry = new ContextRegistry(contexts);
      const description = registry.describe();

      expect(description).toContain('  psu (use psu1, psu2)');
      expect(description).toContain('  load (use load1, load2)');
    });
  });

  describe('device index tracking', () => {
    it('should assign correct indices to devices', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'M01' },
        { portPath: '/dev/ttyUSB2', category: 'psu', machineType: 'M02' }
      ];

      const registry = new ContextRegistry(contexts);

      expect(registry.getContext('psu1')?.index).toBe(1);
      expect(registry.getContext('psu2')?.index).toBe(2);
      expect(registry.getContext('psu3')?.index).toBe(3);
    });

    it('should assign index 1 to single device', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'P906' }
      ];

      const registry = new ContextRegistry(contexts);

      expect(registry.getContext('psu')?.index).toBe(1);
    });
  });

  describe('stable ordering', () => {
    it('should sort devices by portPath for consistent ordering', () => {
      // Devices provided in non-sorted order (simulates unpredictable USB enumeration)
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB2', category: 'psu', machineType: 'P906' },
        { portPath: '/dev/ttyUSB0', category: 'psu', machineType: 'M01' },
        { portPath: '/dev/ttyUSB1', category: 'psu', machineType: 'M02' }
      ];

      const registry = new ContextRegistry(contexts);

      // Should be sorted by portPath, not input order
      expect(registry.getContext('psu1')?.portPath).toBe('/dev/ttyUSB0');
      expect(registry.getContext('psu2')?.portPath).toBe('/dev/ttyUSB1');
      expect(registry.getContext('psu3')?.portPath).toBe('/dev/ttyUSB2');
    });

    it('should maintain stable ordering across multiple calls', () => {
      const contexts: DeviceContextParams[] = [
        { portPath: '/dev/ttyUSB3', category: 'load', machineType: 'L1060' },
        { portPath: '/dev/ttyUSB1', category: 'load', machineType: 'L1060' }
      ];

      const registry1 = new ContextRegistry(contexts);
      const registry2 = new ContextRegistry([...contexts].reverse());

      // Both registries should have same ordering despite different input order
      expect(registry1.getContext('load1')?.portPath).toBe('/dev/ttyUSB1');
      expect(registry2.getContext('load1')?.portPath).toBe('/dev/ttyUSB1');
    });
  });
});
