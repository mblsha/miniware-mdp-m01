import { describe, it, expect, vi } from 'vitest';
import {
  decodePacket,
  processSynthesizePacket,
  processWavePacket,
  processAddressPacket,
  processMachinePacket
} from '../../src/lib/packet-decoder.js';
import {
  createSynthesizePacket,
  createWavePacket,
  createMachinePacket,
  createAddressPacket,
  createMalformedPacket
} from '../mocks/packet-data.js';

// Mock Kaitai imports
vi.mock('kaitai-struct/KaitaiStream', () => {
  return {
    default: class KaitaiStream {
      constructor(buffer) {
        this.buffer = buffer;
        this.pos = 0;
      }
      
      readU1() {
        return new DataView(this.buffer).getUint8(this.pos++);
      }
      
      readU2le() {
        const val = new DataView(this.buffer).getUint16(this.pos, true);
        this.pos += 2;
        return val;
      }
      
      readU4le() {
        const val = new DataView(this.buffer).getUint32(this.pos, true);
        this.pos += 4;
        return val;
      }
      
      readBytes(n) {
        const bytes = new Uint8Array(this.buffer, this.pos, n);
        this.pos += n;
        return bytes;
      }
    }
  };
});

vi.mock('../../src/lib/kaitai/MiniwareMdpM01.js', () => {
  return {
    default: class MiniwareMdpM01 {
      constructor(stream) {
        this.stream = stream;
        this._read();
      }
      
      _read() {
        // Read header
        this.header1 = this.stream.readU1();
        this.header2 = this.stream.readU1();
        this.packetType = this.stream.readU1();
        this.size = this.stream.readU1();
        this.channel = this.stream.readU1();
        this.checksum = this.stream.readU1();
        
        // Read body based on type
        this.body = {};
        switch (this.packetType) {
          case 0x11: // Synthesize
            this.body.synthesize = this._readSynthesize();
            break;
          case 0x12: // Wave
            this.body.wave = this._readWave();
            break;
          case 0x13: // Address
            this.body.addr = this._readAddress();
            break;
          case 0x15: // Machine
            this.body.machine = this.stream.readU1();
            break;
        }
      }
      
      _readSynthesize() {
        const channels = [];
        for (let i = 0; i < 6; i++) {
          channels.push({
            online: this.stream.readU1(),
            machineType: this.stream.readU1(),
            voltage: this.stream.readU2le(),
            current: this.stream.readU2le(),
            temperature: this.stream.readU2le(),
            isOutput: this.stream.readU1(),
            p905Type: this.stream.readU1(),
            p906Type: this.stream.readU1(),
            l1060Type: this.stream.readU1(),
            errorCode: this.stream.readU1(),
            address: Array.from(this.stream.readBytes(5)),
            reserved: this.stream.readBytes(8)
          });
        }
        return { channels };
      }
      
      _readWave() {
        const groups = [];
        for (let i = 0; i < 10; i++) {
          const group = {
            time: this.stream.readU4le(),
            datas: []
          };
          for (let j = 0; j < 2; j++) {
            group.datas.push({
              voltage: this.stream.readU2le(),
              current: this.stream.readU2le()
            });
          }
          groups.push(group);
        }
        return { groups };
      }
      
      _readAddress() {
        const channels = [];
        for (let i = 0; i < 6; i++) {
          channels.push({
            address: Array.from(this.stream.readBytes(5)),
            frequencyOffset: this.stream.readU1()
          });
        }
        return { channels };
      }
    }
  };
});

describe('Packet Decoder', () => {
  describe('decodePacket', () => {
    it('should decode a valid packet', () => {
      const packet = createMachinePacket(0x10);
      const decoded = decodePacket(Array.from(packet));
      
      expect(decoded).toBeTruthy();
      expect(decoded.header1).toBe(0x5A);
      expect(decoded.header2).toBe(0x5A);
      expect(decoded.packetType).toBe(0x15);
      expect(decoded.channel).toBe(0xEE);
    });

    it('should handle empty data', () => {
      const decoded = decodePacket([]);
      expect(decoded).toBeNull();
    });

    it('should handle malformed packets', () => {
      const malformed = createMalformedPacket('bad-header');
      const decoded = decodePacket(Array.from(malformed));
      
      // Should still parse but with wrong header
      expect(decoded).toBeTruthy();
      expect(decoded.header1).not.toBe(0x5A);
    });
  });

  describe('processSynthesizePacket', () => {
    it('should process valid synthesize packet', () => {
      const packet = createSynthesizePacket([
        { online: 1, machineType: 0, voltage: 5000, current: 1000, temperature: 255, isOutput: 1, mode: 1 },
        { online: 1, machineType: 1, voltage: 3300, current: 500, temperature: 200, isOutput: 0, mode: 2 },
        { online: 0, machineType: 2, voltage: 0, current: 0, temperature: 0, isOutput: 0, mode: 0 }
      ]);
      
      const decoded = decodePacket(Array.from(packet));
      const processed = processSynthesizePacket(decoded);
      
      expect(processed).toHaveLength(6);
      
      // Check first channel
      expect(processed[0]).toEqual({
        channel: 0,
        online: true,
        machineType: 'P905',
        voltage: 5,
        current: 1,
        power: 5,
        temperature: 25.5,
        isOutput: true,
        mode: 'Normal',
        address: [0x01, 0x02, 0x03, 0x04, 0x05]
      });
      
      // Check second channel
      expect(processed[1]).toEqual({
        channel: 1,
        online: true,
        machineType: 'P906',
        voltage: 3.3,
        current: 0.5,
        power: 1.65,
        temperature: 20,
        isOutput: false,
        mode: 'CV',
        address: [0x01, 0x02, 0x03, 0x04, 0x05]
      });
      
      // Check offline channel
      expect(processed[2].online).toBe(false);
      expect(processed[2].machineType).toBe('L1060');
    });

    it('should handle null packet', () => {
      const result = processSynthesizePacket(null);
      expect(result).toBeNull();
    });

    it('should handle packet without synthesize body', () => {
      const decoded = {
        body: {}
      };
      const result = processSynthesizePacket(decoded);
      expect(result).toBeNull();
    });

    it('should calculate power correctly', () => {
      const packet = createSynthesizePacket([
        { voltage: 12000, current: 2500 } // 12V * 2.5A = 30W
      ]);
      
      const decoded = decodePacket(Array.from(packet));
      const processed = processSynthesizePacket(decoded);
      
      expect(processed[0].voltage).toBeCloseTo(12);
      expect(processed[0].current).toBeCloseTo(2.5);
      expect(processed[0].power).toBeCloseTo(30);
    });

    it('should handle L1060 operating modes', () => {
      const packet = createSynthesizePacket([
        { machineType: 2, mode: 0 }, // CC
        { machineType: 2, mode: 1 }, // CV
        { machineType: 2, mode: 2 }, // CR
        { machineType: 2, mode: 3 }, // CP
      ]);
      
      const decoded = decodePacket(Array.from(packet));
      const processed = processSynthesizePacket(decoded);
      
      expect(processed[0].mode).toBe('CC');
      expect(processed[1].mode).toBe('CV');
      expect(processed[2].mode).toBe('CR');
      expect(processed[3].mode).toBe('CP');
    });
  });

  describe('processWavePacket', () => {
    it('should process valid wave packet', () => {
      const points = [];
      for (let i = 0; i < 20; i++) {
        points.push({
          voltage: 3300 + i * 10,
          current: 500 + i * 5
        });
      }
      
      const packet = createWavePacket(2, points);
      const decoded = decodePacket(Array.from(packet));
      const processed = processWavePacket(decoded);
      
      expect(processed).toBeTruthy();
      expect(processed.channel).toBe(2);
      expect(processed.points).toHaveLength(20);
      
      // Check first point
      expect(processed.points[0]).toEqual({
        timestamp: 0,
        voltage: 3.3,
        current: 0.5
      });
      
      // Check last point
      expect(processed.points[19]).toEqual({
        timestamp: 910, // Group 9, point 2
        voltage: 3.49,
        current: 0.595
      });
    });

    it('should calculate timestamps correctly', () => {
      const packet = createWavePacket(0);
      const decoded = decodePacket(Array.from(packet));
      const processed = processWavePacket(decoded);
      
      // Each group has base timestamp, points are 10ms apart
      expect(processed.points[0].timestamp).toBe(0);    // Group 0, point 0
      expect(processed.points[1].timestamp).toBe(10);   // Group 0, point 1
      expect(processed.points[2].timestamp).toBe(100);  // Group 1, point 0
      expect(processed.points[3].timestamp).toBe(110);  // Group 1, point 1
    });

    it('should handle null packet', () => {
      const result = processWavePacket(null);
      expect(result).toBeNull();
    });

    it('should handle packet without wave body', () => {
      const decoded = {
        channel: 0,
        body: {}
      };
      const result = processWavePacket(decoded);
      expect(result).toBeNull();
    });
  });

  describe('processAddressPacket', () => {
    it('should process valid address packet', () => {
      const addresses = [
        { address: [0x01, 0x02, 0x03, 0x04, 0x05], frequencyOffset: 0 },
        { address: [0x11, 0x12, 0x13, 0x14, 0x15], frequencyOffset: 10 },
        { address: [0x21, 0x22, 0x23, 0x24, 0x25], frequencyOffset: 20 },
        { address: [0x00, 0x00, 0x00, 0x00, 0x00], frequencyOffset: 0 },
        { address: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF], frequencyOffset: 83 },
        { address: [0xAA, 0xBB, 0xCC, 0xDD, 0xEE], frequencyOffset: 50 }
      ];
      
      const packet = createAddressPacket(addresses);
      const decoded = decodePacket(Array.from(packet));
      const processed = processAddressPacket(decoded);
      
      expect(processed).toHaveLength(6);
      
      // Check first address
      expect(processed[0]).toEqual({
        channel: 0,
        address: [0x01, 0x02, 0x03, 0x04, 0x05],
        frequency: 2400
      });
      
      // Check frequency calculation
      expect(processed[1].frequency).toBe(2410); // 2400 + 10
      expect(processed[4].frequency).toBe(2483); // 2400 + 83
    });

    it('should handle null packet', () => {
      const result = processAddressPacket(null);
      expect(result).toBeNull();
    });

    it('should handle empty addresses', () => {
      const packet = createAddressPacket();
      const decoded = decodePacket(Array.from(packet));
      const processed = processAddressPacket(decoded);
      
      expect(processed).toHaveLength(6);
      processed.forEach((addr, i) => {
        expect(addr.channel).toBe(i);
        expect(addr.address).toEqual([0, 0, 0, 0, 0]);
        expect(addr.frequency).toBe(2400);
      });
    });
  });

  describe('processMachinePacket', () => {
    it('should process M01 machine type', () => {
      const packet = createMachinePacket(0x10);
      const decoded = decodePacket(Array.from(packet));
      const processed = processMachinePacket(decoded);
      
      expect(processed).toEqual({
        type: 'M01',
        hasLCD: true
      });
    });

    it('should process M02 machine type', () => {
      const packet = createMachinePacket(0x11);
      const decoded = decodePacket(Array.from(packet));
      const processed = processMachinePacket(decoded);
      
      expect(processed).toEqual({
        type: 'M02',
        hasLCD: false
      });
    });

    it('should handle unknown machine type', () => {
      const packet = createMachinePacket(0xFF);
      const decoded = decodePacket(Array.from(packet));
      const processed = processMachinePacket(decoded);
      
      expect(processed).toEqual({
        type: 'M02',
        hasLCD: false
      });
    });

    it('should handle null packet', () => {
      const result = processMachinePacket(null);
      expect(result).toBeNull();
    });

    it('should handle packet without machine body', () => {
      const decoded = {
        body: {}
      };
      const result = processMachinePacket(decoded);
      expect(result).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very high temperature values', () => {
      const packet = createSynthesizePacket([
        { temperature: 9999 } // 999.9°C
      ]);
      
      const decoded = decodePacket(Array.from(packet));
      const processed = processSynthesizePacket(decoded);
      
      expect(processed[0].temperature).toBe(999.9);
    });

    it('should handle maximum voltage and current', () => {
      const packet = createSynthesizePacket([
        { voltage: 65535, current: 65535 } // Max uint16
      ]);
      
      const decoded = decodePacket(Array.from(packet));
      const processed = processSynthesizePacket(decoded);
      
      expect(processed[0].voltage).toBe(65.535);
      expect(processed[0].current).toBe(65.535);
    });

    it('should handle zero values correctly', () => {
      const packet = createSynthesizePacket([
        { voltage: 0, current: 0, temperature: 0 }
      ]);
      
      const decoded = decodePacket(Array.from(packet));
      const processed = processSynthesizePacket(decoded);
      
      expect(processed[0].voltage).toBe(0);
      expect(processed[0].current).toBe(0);
      expect(processed[0].temperature).toBe(0);
      expect(processed[0].power).toBe(0);
    });
  });
});