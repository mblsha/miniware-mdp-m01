import { describe, it, expect, vi } from 'vitest';
import {
  createSynthesizePacket,
  createWavePacket,
  createMachinePacket,
  createAddressPacket,
  createMalformedPacket
} from '../mocks/packet-data.js';
import { createKaitaiMock } from '../mocks/kaitai-wrapper-mock.js';


// Mock the kaitai-wrapper.js module
vi.mock('$lib/kaitai-wrapper.js', () => createKaitaiMock());

// Now import after the mock is set up
import {
  decodePacket,
  processSynthesizePacket,
  processWavePacket,
  processAddressPacket,
  processMachinePacket,
  PackType
} from '$lib/packet-decoder.js';

describe('Packet Decoder', () => {
  describe('decodePacket', () => {
    it('should decode valid synthesize packet', () => {
      const packet = createSynthesizePacket();
      const decoded = decodePacket(packet);
      
      expect(decoded).toBeTruthy();
      expect(decoded.packType).toBe(0x11);
    });

    it('should decode valid wave packet', () => {
      const packet = createWavePacket(0, 126);
      const decoded = decodePacket(packet);
      
      expect(decoded).toBeTruthy();
      expect(decoded.packType).toBe(0x12);
    });

    it('should decode valid machine packet', () => {
      const packet = createMachinePacket(0x10);
      const decoded = decodePacket(packet);
      
      expect(decoded).toBeTruthy();
      expect(decoded.packType).toBe(0x15);
    });

    it('should decode valid address packet', () => {
      const packet = createAddressPacket();
      const decoded = decodePacket(packet);
      
      expect(decoded).toBeTruthy();
      expect(decoded.packType).toBe(0x13);
    });

    it('should return null for invalid packet', () => {
      const packet = createMalformedPacket();
      const decoded = decodePacket(packet);
      
      expect(decoded).toBeNull();
    });

    it('should return null for empty data', () => {
      const decoded = decodePacket(null);
      expect(decoded).toBeNull();
    });

    it('should return null for packet too short', () => {
      const decoded = decodePacket(new Uint8Array([0x5A, 0x5A, 0x11]));
      expect(decoded).toBeNull();
    });
  });

  describe('processSynthesizePacket', () => {
    it('should process valid synthesize packet', () => {
      const rawPacket = createSynthesizePacket();
      const decoded = decodePacket(rawPacket);
      const processed = processSynthesizePacket(decoded);
      
      expect(processed).toBeTruthy();
      expect(processed).toHaveLength(6);
      
      // Check first channel
      const channel0 = processed[0];
      expect(channel0.channel).toBe(0);
      expect(channel0.online).toBe(true);
      expect(channel0.voltage).toBeCloseTo(3.3);
      expect(channel0.current).toBeCloseTo(0.5);
      expect(channel0.temperature).toBeCloseTo(25.5);
    });

    it('should handle offline channels', () => {
      const rawPacket = createSynthesizePacket();
      const decoded = decodePacket(rawPacket);
      const processed = processSynthesizePacket(decoded);
      
      // Channels 1-5 should be offline in mock data
      for (let i = 1; i < 6; i++) {
        expect(processed[i].online).toBe(false);
      }
    });

    it('should return null for invalid packet', () => {
      const processed = processSynthesizePacket(null);
      expect(processed).toBeNull();
    });

    it('should return null for wrong packet type', () => {
      const rawPacket = createWavePacket(0, 126);
      const decoded = decodePacket(rawPacket);
      const processed = processSynthesizePacket(decoded);
      expect(processed).toBeNull();
    });
  });

  describe('processWavePacket', () => {
    it('should process wave packet with 2 points per group', () => {
      const rawPacket = createWavePacket(0, 126);
      const decoded = decodePacket(rawPacket);
      const processed = processWavePacket(decoded);
      
      expect(processed).toBeTruthy();
      expect(processed.channel).toBe(0);
      expect(processed.points).toHaveLength(20); // 10 groups * 2 points
      
      // Check first point
      const point0 = processed.points[0];
      expect(point0.timestamp).toBeGreaterThan(0);
      expect(point0.voltage).toBeCloseTo(3.3);
      expect(point0.current).toBeCloseTo(0.5);
    });

    it('should process wave packet with 4 points per group', () => {
      const rawPacket = createWavePacket(0, 206);
      const decoded = decodePacket(rawPacket);
      const processed = processWavePacket(decoded);
      
      expect(processed).toBeTruthy();
      expect(processed.points).toHaveLength(40); // 10 groups * 4 points
    });

    it('should return null for invalid packet', () => {
      const processed = processWavePacket(null);
      expect(processed).toBeNull();
    });

    it('should return null for wrong packet type', () => {
      const rawPacket = createSynthesizePacket();
      const decoded = decodePacket(rawPacket);
      const processed = processWavePacket(decoded);
      expect(processed).toBeNull();
    });
  });

  describe('processAddressPacket', () => {
    it('should process address packet', () => {
      const rawPacket = createAddressPacket();
      const decoded = decodePacket(rawPacket);
      const processed = processAddressPacket(decoded);
      
      expect(processed).toBeTruthy();
      expect(processed).toHaveLength(6);
      
      // Check first channel
      const addr0 = processed[0];
      expect(addr0.address).toEqual([1, 2, 3, 4, 5]);
      expect(addr0.frequency).toBe(2440);
    });

    it('should handle empty addresses', () => {
      const rawPacket = createAddressPacket();
      const decoded = decodePacket(rawPacket);
      const processed = processAddressPacket(decoded);
      
      // Channels 1-5 have empty addresses in mock
      for (let i = 1; i < 6; i++) {
        expect(processed[i].address).toEqual([0, 0, 0, 0, 0]);
        expect(processed[i].frequency).toBe(2400);
      }
    });

    it('should return null for invalid packet', () => {
      const processed = processAddressPacket(null);
      expect(processed).toBeNull();
    });

    it('should return null for wrong packet type', () => {
      const rawPacket = createMachinePacket(0x10);
      const decoded = decodePacket(rawPacket);
      const processed = processAddressPacket(decoded);
      expect(processed).toBeNull();
    });
  });

  describe('processMachinePacket', () => {
    it('should process M01 machine packet', () => {
      const rawPacket = createMachinePacket(0x10);
      const decoded = decodePacket(rawPacket);
      const processed = processMachinePacket(decoded);
      
      expect(processed).toBeTruthy();
      expect(processed.type).toBe('M01');
      expect(processed.hasLCD).toBe(true);
    });

    it('should process M02 machine packet', () => {
      const rawPacket = createMachinePacket(0x11);
      const decoded = decodePacket(rawPacket);
      const processed = processMachinePacket(decoded);
      
      expect(processed).toBeTruthy();
      expect(processed.type).toBe('M02');
      expect(processed.hasLCD).toBe(false);
    });

    it('should handle unknown machine types', () => {
      const rawPacket = createMachinePacket(0x99);
      const decoded = decodePacket(rawPacket);
      const processed = processMachinePacket(decoded);
      
      expect(processed).toBeTruthy();
      expect(processed.type).toBe('M02');
      expect(processed.hasLCD).toBe(false);
    });

    it('should return null for invalid packet', () => {
      const processed = processMachinePacket(null);
      expect(processed).toBeNull();
    });

    it('should return null for wrong packet type', () => {
      const rawPacket = createSynthesizePacket();
      const decoded = decodePacket(rawPacket);
      const processed = processMachinePacket(decoded);
      expect(processed).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle corrupted packet data gracefully', () => {
      const corruptedData = new Uint8Array([0x5A, 0x5A, 0x11, 0x9C, 0x00, 0xFF, 0x00, 0x00]);
      const decoded = decodePacket(corruptedData);
      
      // Should return null for corrupted data that can't be parsed
      expect(decoded).toBeNull();
    });

    it('should handle oversized packets', () => {
      const oversized = new Uint8Array(1000).fill(0);
      oversized[0] = 0x5A;
      oversized[1] = 0x5A;
      oversized[2] = 0x11;
      oversized[3] = 0xFF; // Invalid size
      
      const decoded = decodePacket(oversized);
      expect(decoded).toBeNull(); // Should return null for size mismatch
    });
  });
});
