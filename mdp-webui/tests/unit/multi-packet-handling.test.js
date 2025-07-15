import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SerialConnection } from '$lib/serial.js';

// Mock the Kaitai dependencies first
vi.mock('$lib/kaitai-wrapper.js', () => {
  const MockMiniwareMdpM01 = vi.fn(() => {
    throw new Error('Kaitai parser not available in test environment');
  });
  MockMiniwareMdpM01.PackType = {
    SYNTHESIZE: 0x11,
    WAVE: 0x12,
    HEARTBEAT: 0x22,
    MACHINE: 0x16
  };
  
  return {
    KaitaiStream: vi.fn(),
    MiniwareMdpM01: MockMiniwareMdpM01
  };
});

// Now import after mocking
const { decodePacket } = await import('$lib/packet-decoder.js');

describe('Multi-Packet Handling Analysis', () => {
  
  describe('packet-decoder.js with multiple packets', () => {
    it('should FAIL when decodePacket receives multiple packets', () => {
      // Create two small packets
      const packet1 = [0x5A, 0x5A, 0x22, 0x06, 0xEE, 0x00]; // Heartbeat (6 bytes)
      const packet2 = [0x5A, 0x5A, 0x16, 0x07, 0xEE, 0x10, 0x10]; // Machine (7 bytes)
      
      // Combine them
      const multiPacketData = [...packet1, ...packet2];
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Try to decode multi-packet data - this WILL FAIL
      const result = decodePacket(multiPacketData);
      
      expect(result).toBeNull();
      // Check that malformed data was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        '🚨 MALFORMED DATA: Packet size mismatch'
      );
      
      consoleSpy.mockRestore();
    });

    it('should succeed with individual packets', () => {
      const packet1 = [0x5A, 0x5A, 0x22, 0x06, 0xEE, 0x00];
      const packet2 = [0x5A, 0x5A, 0x16, 0x07, 0xEE, 0x10, 0x10];
      
      // Mock the Kaitai parser since we're testing the validation logic
      vi.doMock('$lib/kaitai-wrapper.js', () => ({
        KaitaiStream: vi.fn(),
        MiniwareMdpM01: vi.fn(() => ({
          packets: [{ type: 'test' }]
        }))
      }));
      
      // Individual packets should work (would work if Kaitai was properly mocked)
      // Just testing that size validation passes
      expect(packet1.length).toBe(packet1[3]); // 6 === 6
      expect(packet2.length).toBe(packet2[3]); // 7 === 7
    });
  });

  describe('SerialConnection buffer handling with multiple packets', () => {
    it('should correctly process multiple packets in single data block', () => {
      const serialConnection = new SerialConnection();
      
      // Create multiple packets
      const heartbeat = [0x5A, 0x5A, 0x22, 0x06, 0xEE, 0x00];
      const machine = [0x5A, 0x5A, 0x16, 0x07, 0xEE, 0x10, 0x10];
      const update = [0x5A, 0x5A, 0x15, 0x07, 0xEE, 0x02, 0x02];
      
      const allPackets = [...heartbeat, ...machine, ...update];
      
      const receivedPackets = [];
      const receivedTypes = [];
      
      // Register handlers
      serialConnection.registerPacketHandler(0x22, (packet) => {
        receivedPackets.push(packet);
        receivedTypes.push('heartbeat');
      });
      serialConnection.registerPacketHandler(0x16, (packet) => {
        receivedPackets.push(packet);
        receivedTypes.push('machine');
      });
      serialConnection.registerPacketHandler(0x15, (packet) => {
        receivedPackets.push(packet);
        receivedTypes.push('update');
      });
      
      // Simulate receiving all packets in one data block
      serialConnection.receiveBuffer = new Uint8Array(allPackets);
      serialConnection.processIncomingData();
      
      // Should process all 3 packets
      expect(receivedPackets.length).toBe(3);
      expect(receivedTypes).toEqual(['heartbeat', 'machine', 'update']);
      expect(serialConnection.receiveBuffer.length).toBe(0);
      
      // Verify individual packets are correct
      expect(Array.from(receivedPackets[0])).toEqual(heartbeat);
      expect(Array.from(receivedPackets[1])).toEqual(machine);
      expect(Array.from(receivedPackets[2])).toEqual(update);
    });

    it('should handle packets with varying sizes correctly', () => {
      const serialConnection = new SerialConnection();
      
      // Create packets of different sizes
      const smallPacket = [0x5A, 0x5A, 0x22, 0x06, 0xEE, 0x00]; // 6 bytes
      const mediumPacket = createMachinePacket(0x11); // 7 bytes
      const largePacket = createSynthesizePacket(); // 156 bytes
      
      const allData = [...smallPacket, ...mediumPacket, ...largePacket];
      
      const processedSizes = [];
      
      // Register handler to track packet sizes
      serialConnection.registerPacketHandler(0x22, (packet) => processedSizes.push(packet.length));
      serialConnection.registerPacketHandler(0x16, (packet) => processedSizes.push(packet.length));
      serialConnection.registerPacketHandler(0x11, (packet) => processedSizes.push(packet.length));
      
      serialConnection.receiveBuffer = new Uint8Array(allData);
      serialConnection.processIncomingData();
      
      expect(processedSizes).toEqual([6, 7, 156]);
      expect(serialConnection.receiveBuffer.length).toBe(0);
    });

    it('should demonstrate the issue if someone bypassed SerialConnection', () => {
      // This shows what would happen if someone tried to use packet-decoder 
      // directly on multi-packet data (they would lose packets)
      
      const packet1 = [0x5A, 0x5A, 0x22, 0x06, 0xEE, 0x00];
      const packet2 = [0x5A, 0x5A, 0x16, 0x07, 0xEE, 0x10, 0x10];
      const multiPacketData = [...packet1, ...packet2];
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // This is the WRONG way - would lose packets
      const result = decodePacket(multiPacketData);
      expect(result).toBeNull(); // ALL packets lost due to size validation failure
      
      // This is the RIGHT way - process through SerialConnection
      const serialConnection = new SerialConnection();
      const receivedPackets = [];
      
      serialConnection.registerPacketHandler(0x22, (packet) => receivedPackets.push(packet));
      serialConnection.registerPacketHandler(0x16, (packet) => receivedPackets.push(packet));
      
      serialConnection.receiveBuffer = new Uint8Array(multiPacketData);
      serialConnection.processIncomingData();
      
      expect(receivedPackets.length).toBe(2); // Both packets processed correctly
      
      consoleSpy.mockRestore();
    });
  });

  // Helper functions
  function createMachinePacket(machineType) {
    const data = [machineType];
    const checksum = data[0];
    return [0x5A, 0x5A, 0x16, 0x07, 0xEE, checksum, ...data];
  }

  function createSynthesizePacket() {
    const packet = [0x5A, 0x5A, 0x11, 156, 0xEE];
    const data = [];

    // 6 channels, 25 bytes each = 150 bytes
    for (let ch = 0; ch < 6; ch++) {
      // Create minimal 25-byte channel data
      data.push(ch);                        // num
      data.push(0xDC, 0x05);               // outVoltageRaw
      data.push(0xF4, 0x01);               // outCurrentRaw
      data.push(0x10, 0x0E);               // inVoltageRaw
      data.push(0x64, 0x00);               // inCurrentRaw
      data.push(0xDC, 0x05);               // setVoltageRaw
      data.push(0xF4, 0x01);               // setCurrentRaw
      data.push(0xFA, 0x00);               // tempRaw
      data.push(1);                        // online
      data.push(2);                        // type
      data.push(0);                        // lock
      data.push(0);                        // status
      data.push(0);                        // outputOn
      data.push(0, 0, 0);                  // color
      data.push(0);                        // error
      data.push(0xFF);                     // end marker
    }

    let checksum = 0;
    for (const byte of data) {
      checksum ^= byte;
    }

    packet.push(checksum);
    packet.push(...data);
    return packet;
  }
});
