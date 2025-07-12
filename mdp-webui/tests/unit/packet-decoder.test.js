import { describe, it, expect, vi } from 'vitest';
import {
  createSynthesizePacket,
  createWavePacket,
  createMachinePacket,
  createAddressPacket,
  createMalformedPacket
} from '../mocks/packet-data.js';

// Mock the kaitai-wrapper.js module
vi.mock('../../src/lib/kaitai-wrapper.js', () => {
  const PackType = {
    SYNTHESIZE: 0x11,  // 17
    WAVE: 0x12,        // 18
    ADDR: 0x13,        // 19
    UPDAT_CH: 0x14,    // 20
    MACHINE: 0x15      // 21
  };

  class KaitaiStream {
    constructor(buffer) {
      // Ensure buffer is an ArrayBuffer
      this.buffer = buffer.buffer instanceof ArrayBuffer ? buffer.buffer : buffer;
      this.pos = 0;
      this.view = new DataView(this.buffer);
    }
    
    readU1() {
      return this.view.getUint8(this.pos++);
    }
    
    readU2le() {
      if (this.pos + 2 > this.buffer.byteLength) throw new RangeError("Offset is outside the bounds of the DataView");
      const val = this.view.getUint16(this.pos, true);
      this.pos += 2;
      return val;
    }
    
    readU4le() {
      if (this.pos + 4 > this.buffer.byteLength) throw new RangeError("Offset is outside the bounds of the DataView");
      const val = this.view.getUint32(this.pos, true);
      this.pos += 4;
      return val;
    }
    
    readBytes(n) {
      if (this.pos + n > this.buffer.byteLength) throw new RangeError("Offset is outside the bounds of the DataView");
      const bytes = new Uint8Array(this.buffer.slice(this.pos, this.pos + n));
      this.pos += n;
      return bytes;
    }
  }

  class MiniwareMdpM01 {
    constructor(stream) {
      this.stream = stream;
      this.packets = [];
      this._read();
    }
    
    _read() {
      if (this.stream.buffer.byteLength < 6) return;
      // Read header
      this.header1 = this.stream.readU1();
      this.header2 = this.stream.readU1();
      const packetType = this.stream.readU1();
      this.size = this.stream.readU1();
      this.channel = this.stream.readU1();
      this.checksum = this.stream.readU1();
      
      // Create packet structure matching real Kaitai output
      const packet = {
        packType: packetType,
        size: this.size,
        channel: this.channel,
        checksum: this.checksum,
        data: null
      };
      
      // Read data based on type
      switch (packetType) {
        case PackType.SYNTHESIZE:
          packet.data = this._readSynthesize();
          break;
        case PackType.WAVE:
          packet.data = this._readWave();
          break;
        case PackType.ADDR:
          packet.data = this._readAddress();
          break;
        case PackType.MACHINE:
          packet.data = this._readMachine();
          break;
      }
      
      this.packets.push(packet);
    }
    
    _readSynthesize() {
      const channels = [];
      for (let i = 0; i < 6; i++) {
        const ch = {
          num: this.stream.readU1(),
          outVoltageRaw: this.stream.readU2le(),
          outCurrentRaw: this.stream.readU2le(),
          inVoltageRaw: this.stream.readU2le(),
          inCurrentRaw: this.stream.readU2le(),
          setVoltageRaw: this.stream.readU2le(),
          setCurrentRaw: this.stream.readU2le(),
          tempRaw: this.stream.readU2le(),
          online: this.stream.readU1(),
          type: this.stream.readU1(),
          lock: this.stream.readU1(),
          statusLoad: this.stream.readU1(),
          outputOn: this.stream.readU1(),
          color: this.stream.readBytes(3),
          error: this.stream.readU1(),
          end: this.stream.readBytes(1)
        };
        // Add computed properties
        ch.outVoltage = ch.outVoltageRaw / 1000.0;
        ch.outCurrent = ch.outCurrentRaw / 1000.0;
        ch.temperature = ch.tempRaw / 10.0;
        channels.push(ch);
      }
      return { channels, channel: 0, dummy: 0 };
    }
    
    _readWave() {
      const groups = [];
      const groupCount = 10;
      const pointsPerGroup = this.size === 126 ? 2 : 4;
      
      for (let i = 0; i < groupCount; i++) {
        const group = {
          timestamp: this.stream.readU4le(),
          items: []
        };
        
        for (let j = 0; j < pointsPerGroup; j++) {
          const item = {
            voltageRaw: this.stream.readU2le(),
            currentRaw: this.stream.readU2le()
          };
          item.voltage = item.voltageRaw / 1000.0;
          item.current = item.currentRaw / 1000.0;
          group.items.push(item);
        }
        
        groups.push(group);
      }
      
      return { 
        groups,
        channel: this.channel
      };
    }
    
    _readAddress() {
      const channels = [];
      for (let i = 0; i < 6; i++) {
        channels.push({
          address: this.stream.readBytes(5),
          frequencyOffset: this.stream.readU1()
        });
      }
      return { addresses: channels };
    }
    
    _readMachine() {
      const channel = this.stream.readU1();
      const dummy = this.stream.readU1();
      const machineTypeRaw = this.stream.readU1();
      return {
        channel,
        dummy,
        machineTypeRaw
      };
    }
  }
  
  MiniwareMdpM01.PackType = PackType;
  
  return {
    KaitaiStream,
    MiniwareMdpM01
  };
});

// Now import after the mock is set up
import {
  decodePacket,
  processSynthesizePacket,
  processWavePacket,
  processAddressPacket,
  processMachinePacket,
  PackType
} from '../../src/lib/packet-decoder.js';

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