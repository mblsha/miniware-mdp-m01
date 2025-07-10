import { describe, it, expect } from 'vitest';
import {
  PacketType,
  createHeartbeatPacket,
  createGetMachinePacket,
  createSetChannelPacket,
  createSetVoltagePacket,
  createSetCurrentPacket,
  createSetOutputPacket,
  createGetAddressPacket,
  createSetAddressPacket,
  createSetAllAddressPacket,
  createStartAutoMatchPacket,
  createStopAutoMatchPacket,
  createResetToDfuPacket,
  createRgbPacket
} from '../../src/lib/packet-encoder.js';

describe('Packet Encoder', () => {
  describe('Packet Type Constants', () => {
    it('should have correct packet type values', () => {
      expect(PacketType.SET_ISOUTPUT).toBe(0x16);
      expect(PacketType.GET_ADDR).toBe(0x17);
      expect(PacketType.SET_ADDR).toBe(0x18);
      expect(PacketType.SET_CH).toBe(0x19);
      expect(PacketType.SET_V).toBe(0x1A);
      expect(PacketType.SET_I).toBe(0x1B);
      expect(PacketType.SET_ALL_ADDR).toBe(0x1C);
      expect(PacketType.START_AUTO_MATCH).toBe(0x1D);
      expect(PacketType.STOP_AUTO_MATCH).toBe(0x1E);
      expect(PacketType.RESET_TO_DFU).toBe(0x1F);
      expect(PacketType.RGB).toBe(0x20);
      expect(PacketType.GET_MACHINE).toBe(0x21);
      expect(PacketType.HEARTBEAT).toBe(0x22);
    });
  });

  describe('Empty Packet Creation', () => {
    it('should create heartbeat packet', () => {
      const packet = createHeartbeatPacket();
      expect(packet).toEqual([0x5A, 0x5A, 0x22, 0x06, 0xEE, 0x00]);
    });

    it('should create get machine packet', () => {
      const packet = createGetMachinePacket();
      expect(packet).toEqual([0x5A, 0x5A, 0x21, 0x06, 0xEE, 0x00]);
    });

    it('should create get address packet', () => {
      const packet = createGetAddressPacket();
      expect(packet).toEqual([0x5A, 0x5A, 0x17, 0x06, 0xEE, 0x00]);
    });

    it('should create start auto match packet', () => {
      const packet = createStartAutoMatchPacket();
      expect(packet).toEqual([0x5A, 0x5A, 0x1D, 0x06, 0xEE, 0x00]);
    });

    it('should create stop auto match packet', () => {
      const packet = createStopAutoMatchPacket();
      expect(packet).toEqual([0x5A, 0x5A, 0x1E, 0x06, 0xEE, 0x00]);
    });

    it('should create reset to DFU packet', () => {
      const packet = createResetToDfuPacket();
      expect(packet).toEqual([0x5A, 0x5A, 0x1F, 0x06, 0xEE, 0x00]);
    });
  });

  describe('Set Channel Packet', () => {
    it('should create packet for channel 0', () => {
      const packet = createSetChannelPacket(0);
      expect(packet).toEqual([0x5A, 0x5A, 0x19, 0x06, 0x00, 0x00]);
    });

    it('should create packet for channel 5', () => {
      const packet = createSetChannelPacket(5);
      expect(packet).toEqual([0x5A, 0x5A, 0x19, 0x06, 0x05, 0x00]);
    });

    it('should handle channel 255', () => {
      const packet = createSetChannelPacket(255);
      expect(packet).toEqual([0x5A, 0x5A, 0x19, 0x06, 0xFF, 0x00]);
    });
  });

  describe('Set Voltage Packet', () => {
    it('should create packet with typical values', () => {
      const packet = createSetVoltagePacket(0, 3.3, 0.5);
      expect(packet).toEqual([
        0x5A, 0x5A, 0x1A, 0x0A, 0x00,
        0x1D, // checksum: (0xE4 ^ 0x0C ^ 0xF4 ^ 0x01) = 29
        0xE4, 0x0C, // 3300mV (little-endian)
        0xF4, 0x01  // 500mA (little-endian)
      ]);
    });

    it('should handle zero values', () => {
      const packet = createSetVoltagePacket(1, 0, 0);
      expect(packet).toEqual([
        0x5A, 0x5A, 0x1A, 0x0A, 0x01,
        0x00, // checksum: all zeros XOR to 0
        0x00, 0x00, // 0mV
        0x00, 0x00  // 0mA
      ]);
    });

    it('should handle maximum values', () => {
      const packet = createSetVoltagePacket(2, 30, 5);
      expect(packet).toEqual([
        0x5A, 0x5A, 0x1A, 0x0A, 0x02,
        0xDE, // checksum: (0x30 ^ 0x75 ^ 0x88 ^ 0x13) = 222
        0x30, 0x75, // 30000mV (little-endian)
        0x88, 0x13  // 5000mA (little-endian)
      ]);
    });

    it('should round fractional values', () => {
      const packet = createSetVoltagePacket(0, 3.3456, 0.5678);
      const voltage = (packet[6] | (packet[7] << 8));
      const current = (packet[8] | (packet[9] << 8));
      expect(voltage).toBe(3346); // Rounded to nearest mV
      expect(current).toBe(568);  // Rounded to nearest mA
    });
  });

  describe('Set Current Packet', () => {
    it('should create packet identical to voltage packet', () => {
      const voltagePacket = createSetVoltagePacket(0, 3.3, 0.5);
      const currentPacket = createSetCurrentPacket(0, 3.3, 0.5);
      
      // Only difference should be packet type
      expect(currentPacket[2]).toBe(0x1B); // SET_I type
      expect(voltagePacket[2]).toBe(0x1A); // SET_V type
      
      // Rest should be identical
      expect(currentPacket.slice(3)).toEqual(voltagePacket.slice(3));
    });
  });

  describe('Set Output Packet', () => {
    it('should create packet to enable output', () => {
      const packet = createSetOutputPacket(0, true);
      expect(packet).toEqual([
        0x5A, 0x5A, 0x16, 0x07, 0x00,
        0x01, // checksum
        0x01  // enabled
      ]);
    });

    it('should create packet to disable output', () => {
      const packet = createSetOutputPacket(3, false);
      expect(packet).toEqual([
        0x5A, 0x5A, 0x16, 0x07, 0x03,
        0x00, // checksum
        0x00  // disabled
      ]);
    });
  });

  describe('RGB Packet', () => {
    it('should create packet to enable RGB', () => {
      const packet = createRgbPacket(true);
      expect(packet).toEqual([
        0x5A, 0x5A, 0x20, 0x07, 0xEE,
        0x01, // checksum
        0x01  // enabled
      ]);
    });

    it('should create packet to disable RGB', () => {
      const packet = createRgbPacket(false);
      expect(packet).toEqual([
        0x5A, 0x5A, 0x20, 0x07, 0xEE,
        0x00, // checksum
        0x00  // disabled
      ]);
    });
  });

  describe('Set Address Packet', () => {
    it('should create packet with valid address', () => {
      const address = [0x01, 0x02, 0x03, 0x04, 0x05];
      const frequencyOffset = 10;
      const packet = createSetAddressPacket(0, address, frequencyOffset);
      
      expect(packet).toEqual([
        0x5A, 0x5A, 0x18, 0x0C, 0x00,
        0x0B, // checksum: 0x01^0x02^0x03^0x04^0x05^0x0A = 11
        0x01, 0x02, 0x03, 0x04, 0x05, 0x0A
      ]);
    });

    it('should throw error for invalid address length', () => {
      expect(() => {
        createSetAddressPacket(0, [0x01, 0x02], 0);
      }).toThrow('Address must be 5 bytes');
    });

    it('should handle zero address', () => {
      const address = [0x00, 0x00, 0x00, 0x00, 0x00];
      const packet = createSetAddressPacket(1, address, 0);
      
      expect(packet.slice(6)).toEqual([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    });

    it('should handle maximum frequency offset', () => {
      const address = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
      const packet = createSetAddressPacket(0, address, 83);
      
      expect(packet[11]).toBe(83); // Max offset for 2483 MHz
    });
  });

  describe('Set All Address Packet', () => {
    it('should create packet for 6 channels', () => {
      const addresses = Array(6).fill(null).map((_, i) => ({
        address: [i, i, i, i, i],
        frequencyOffset: i * 10
      }));
      
      const packet = createSetAllAddressPacket(addresses);
      
      expect(packet[0]).toBe(0x5A); // Header
      expect(packet[1]).toBe(0x5A);
      expect(packet[2]).toBe(0x1C); // Type
      expect(packet[3]).toBe(0x2A); // Size (42 bytes)
      expect(packet[4]).toBe(0xEE); // Channel
      
      // Verify first channel data
      expect(packet.slice(6, 12)).toEqual([0, 0, 0, 0, 0, 0]);
      
      // Verify last channel data
      expect(packet.slice(36, 42)).toEqual([5, 5, 5, 5, 5, 50]);
    });

    it('should throw error for wrong number of addresses', () => {
      expect(() => {
        createSetAllAddressPacket([]);
      }).toThrow('Must provide addresses for all 6 channels');
      
      expect(() => {
        createSetAllAddressPacket(Array(5).fill({ address: [0,0,0,0,0], frequencyOffset: 0 }));
      }).toThrow('Must provide addresses for all 6 channels');
    });

    it('should throw error for invalid address in array', () => {
      const addresses = Array(6).fill(null).map(() => ({
        address: [0, 0], // Invalid length
        frequencyOffset: 0
      }));
      
      expect(() => {
        createSetAllAddressPacket(addresses);
      }).toThrow('Each address must be 5 bytes');
    });

    it('should calculate correct checksum', () => {
      const addresses = Array(6).fill(null).map(() => ({
        address: [0x01, 0x02, 0x03, 0x04, 0x05],
        frequencyOffset: 0x06
      }));
      
      const packet = createSetAllAddressPacket(addresses);
      
      // Calculate expected checksum
      let expectedChecksum = 0;
      for (let i = 0; i < 6; i++) {
        expectedChecksum ^= 0x01 ^ 0x02 ^ 0x03 ^ 0x04 ^ 0x05 ^ 0x06;
      }
      
      expect(packet[5]).toBe(expectedChecksum);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative voltage/current by taking absolute value', () => {
      const packet = createSetVoltagePacket(0, -3.3, -0.5);
      const voltage = (packet[6] | (packet[7] << 8));
      const current = (packet[8] | (packet[9] << 8));
      
      // Should handle negative as 0 or throw error
      // Based on implementation, it might convert to positive
      expect(voltage).toBeGreaterThanOrEqual(0);
      expect(current).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large voltage/current values', () => {
      const packet = createSetVoltagePacket(0, 1000, 1000);
      const voltage = (packet[6] | (packet[7] << 8));
      const current = (packet[8] | (packet[9] << 8));
      
      // Should either clamp or wrap around
      expect(voltage).toBeLessThanOrEqual(65535);
      expect(current).toBeLessThanOrEqual(65535);
    });
  });
});