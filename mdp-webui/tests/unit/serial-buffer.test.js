import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

import { SerialConnection } from '$lib/serial.js';
import { get } from 'svelte/store';

describe('SerialConnection Buffer Management', () => {
  let serialConnection;
  let mockPort;
  let mockReader;
  let mockWriter;

  beforeEach(() => {
    // Create mock serial port
    mockPort = {
      readable: { getReader: vi.fn() },
      writable: { getWriter: vi.fn() },
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    };

    mockReader = {
      read: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined)
    };

    mockWriter = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    };

    mockPort.readable.getReader.mockReturnValue(mockReader);
    mockPort.writable.getWriter.mockReturnValue(mockWriter);

    // Mock navigator.serial
    global.navigator = {
      serial: {
        requestPort: vi.fn().mockResolvedValue(mockPort)
      }
    };

    serialConnection = new SerialConnection();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Split Packet Handling', () => {
    it('should handle packet split into two parts', async () => {
      // Create a synthesize packet (156 bytes)
      const fullPacket = createSynthesizePacket();
      
      // Split packet into two parts
      const part1 = fullPacket.slice(0, 80); // First 80 bytes
      const part2 = fullPacket.slice(80);    // Remaining 76 bytes

      const receivedPackets = [];
      serialConnection.registerPacketHandler(0x11, (packet) => {
        receivedPackets.push(packet);
      });

      // Simulate receiving first part
      serialConnection.receiveBuffer = new Uint8Array(part1);
      serialConnection.processIncomingData();
      
      // Should not have processed any packets yet
      expect(receivedPackets.length).toBe(0);
      expect(serialConnection.receiveBuffer.length).toBe(80);

      // Simulate receiving second part
      const combined = new Uint8Array(serialConnection.receiveBuffer.length + part2.length);
      combined.set(serialConnection.receiveBuffer);
      combined.set(new Uint8Array(part2), serialConnection.receiveBuffer.length);
      serialConnection.receiveBuffer = combined;
      serialConnection.processIncomingData();

      // Should have processed the complete packet
      expect(receivedPackets.length).toBe(1);
      expect(Array.from(receivedPackets[0])).toEqual(fullPacket);
      expect(serialConnection.receiveBuffer.length).toBe(0);
    });

    it('should handle packet split into multiple small chunks', async () => {
      const fullPacket = createWavePacket();
      const chunkSize = 20;
      const chunks = [];
      
      // Split into chunks of 20 bytes
      for (let i = 0; i < fullPacket.length; i += chunkSize) {
        chunks.push(fullPacket.slice(i, Math.min(i + chunkSize, fullPacket.length)));
      }

      const receivedPackets = [];
      serialConnection.registerPacketHandler(0x12, (packet) => {
        receivedPackets.push(packet);
      });

      // Process chunks one by one
      for (const chunk of chunks) {
        const combined = new Uint8Array(serialConnection.receiveBuffer.length + chunk.length);
        combined.set(serialConnection.receiveBuffer);
        combined.set(new Uint8Array(chunk), serialConnection.receiveBuffer.length);
        serialConnection.receiveBuffer = combined;
        serialConnection.processIncomingData();
      }

      // Should have processed the complete packet
      expect(receivedPackets.length).toBe(1);
      expect(Array.from(receivedPackets[0])).toEqual(fullPacket);
      expect(serialConnection.receiveBuffer.length).toBe(0);
    });

    it('should handle multiple packets with splits', async () => {
      const packet1 = createHeartbeatPacket();
      const packet2 = createMachinePacket(0x10);
      const packet3 = createUpdateChannelPacket(2);

      // Create a stream with splits
      // packet1 complete, packet2 split, packet3 complete
      const stream = [
        ...packet1,                    // Complete packet 1
        ...packet2.slice(0, 4),       // First 4 bytes of packet 2
        ...packet2.slice(4),          // Rest of packet 2
        ...packet3                    // Complete packet 3
      ];

      const receivedPackets = [];
      const packetTypes = [];

      // Register handlers for all packet types
      serialConnection.registerPacketHandler(0x22, (packet) => {
        receivedPackets.push(packet);
        packetTypes.push('heartbeat');
      });
      serialConnection.registerPacketHandler(0x16, (packet) => {
        receivedPackets.push(packet);
        packetTypes.push('machine');
      });
      serialConnection.registerPacketHandler(0x15, (packet) => {
        receivedPackets.push(packet);
        packetTypes.push('update_channel');
      });

      // Simulate receiving data in chunks
      const chunks = [
        stream.slice(0, 10),   // Part of packet 1
        stream.slice(10, 15),  // Rest of packet 1 + start of packet 2
        stream.slice(15, 25),  // Rest of packet 2 + packet 3
      ];

      for (const chunk of chunks) {
        const combined = new Uint8Array(serialConnection.receiveBuffer.length + chunk.length);
        combined.set(serialConnection.receiveBuffer);
        combined.set(new Uint8Array(chunk), serialConnection.receiveBuffer.length);
        serialConnection.receiveBuffer = combined;
        serialConnection.processIncomingData();
      }

      expect(receivedPackets.length).toBe(3);
      expect(packetTypes).toEqual(['heartbeat', 'machine', 'update_channel']);
      expect(serialConnection.receiveBuffer.length).toBe(0);
    });

    it('should handle garbage data before valid packet', async () => {
      const validPacket = createHeartbeatPacket();
      const garbage = [0xFF, 0xAB, 0xCD, 0x12, 0x34];
      const dataWithGarbage = [...garbage, ...validPacket];

      const receivedPackets = [];
      serialConnection.registerPacketHandler(0x22, (packet) => {
        receivedPackets.push(packet);
      });

      serialConnection.receiveBuffer = new Uint8Array(dataWithGarbage);
      serialConnection.processIncomingData();

      expect(receivedPackets.length).toBe(1);
      expect(Array.from(receivedPackets[0])).toEqual(validPacket);
      expect(serialConnection.receiveBuffer.length).toBe(0);
    });

    it('should handle incomplete header at end of buffer', async () => {
      const packet = createHeartbeatPacket();
      const incompleteHeader = [0x5A]; // Just first byte of header

      const receivedPackets = [];
      serialConnection.registerPacketHandler(0x22, (packet) => {
        receivedPackets.push(packet);
      });

      // Send complete packet
      serialConnection.receiveBuffer = new Uint8Array(packet);
      serialConnection.processIncomingData();
      expect(receivedPackets.length).toBe(1);

      // Send incomplete header
      serialConnection.receiveBuffer = new Uint8Array(incompleteHeader);
      serialConnection.processIncomingData();
      expect(serialConnection.receiveBuffer.length).toBe(1);

      // Complete the header and packet
      const rest = [0x5A, 0x22, 0x06, 0xEE, 0x00];
      const combined = new Uint8Array(serialConnection.receiveBuffer.length + rest.length);
      combined.set(serialConnection.receiveBuffer);
      combined.set(new Uint8Array(rest), serialConnection.receiveBuffer.length);
      serialConnection.receiveBuffer = combined;
      serialConnection.processIncomingData();

      expect(receivedPackets.length).toBe(2);
      expect(serialConnection.receiveBuffer.length).toBe(0);
    });

    it('should clear buffer if too much garbage accumulates', async () => {
      // Create 300 bytes of garbage (no valid headers)
      const garbage = new Uint8Array(300);
      for (let i = 0; i < 300; i++) {
        garbage[i] = 0xFF;
      }

      serialConnection.receiveBuffer = garbage;
      serialConnection.processIncomingData();

      // Should clear the buffer when it gets too large with no valid headers
      expect(serialConnection.receiveBuffer.length).toBe(0);
    });

    it('should handle packet split at header boundary', async () => {
      const packet = createMachinePacket(0x11);
      
      // Split right after the header bytes
      const part1 = packet.slice(0, 2); // Just 0x5A 0x5A
      const part2 = packet.slice(2);    // Rest of packet

      const receivedPackets = [];
      serialConnection.registerPacketHandler(0x16, (packet) => {
        receivedPackets.push(packet);
      });

      // Send first part
      serialConnection.receiveBuffer = new Uint8Array(part1);
      serialConnection.processIncomingData();
      expect(receivedPackets.length).toBe(0);
      expect(serialConnection.receiveBuffer.length).toBe(2);

      // Send second part
      const combined = new Uint8Array(serialConnection.receiveBuffer.length + part2.length);
      combined.set(serialConnection.receiveBuffer);
      combined.set(new Uint8Array(part2), serialConnection.receiveBuffer.length);
      serialConnection.receiveBuffer = combined;
      serialConnection.processIncomingData();

      expect(receivedPackets.length).toBe(1);
      expect(Array.from(receivedPackets[0])).toEqual(packet);
      expect(serialConnection.receiveBuffer.length).toBe(0);
    });
  });

  describe('ReadLoop Integration', () => {
    it('should process split packets through readLoop', async () => {
      const packet = createSynthesizePacket();
      const part1 = packet.slice(0, 100);
      const part2 = packet.slice(100);

      const receivedPackets = [];
      serialConnection.registerPacketHandler(0x11, (packet) => {
        receivedPackets.push(packet);
      });

      // Setup mock reader to return data in parts
      let readCount = 0;
      mockReader.read.mockImplementation(() => {
        readCount++;
        if (readCount === 1) {
          return Promise.resolve({ value: new Uint8Array(part1), done: false });
        } else if (readCount === 2) {
          return Promise.resolve({ value: new Uint8Array(part2), done: false });
        } else {
          return Promise.resolve({ done: true });
        }
      });

      await serialConnection.connect();
      
      // Wait for readLoop to process both parts
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(receivedPackets.length).toBe(1);
      expect(Array.from(receivedPackets[0])).toEqual(packet);
    });

    it('should handle stream of mixed complete and split packets', async () => {
      const heartbeat = createHeartbeatPacket();
      const machine = createMachinePacket(0x10);
      const wave = createWavePacket();

      // Create chunks that split across packet boundaries
      const allData = [...heartbeat, ...machine, ...wave];
      const chunks = [
        allData.slice(0, 8),      // Heartbeat + start of machine
        allData.slice(8, 15),     // Rest of machine + start of wave  
        allData.slice(15, 80),    // Middle of wave
        allData.slice(80)         // Rest of wave
      ];

      const receivedTypes = [];
      serialConnection.registerPacketHandler(0x22, () => receivedTypes.push('heartbeat'));
      serialConnection.registerPacketHandler(0x16, () => receivedTypes.push('machine'));
      serialConnection.registerPacketHandler(0x12, () => receivedTypes.push('wave'));

      let chunkIndex = 0;
      mockReader.read.mockImplementation(() => {
        if (chunkIndex < chunks.length) {
          const chunk = chunks[chunkIndex++];
          return Promise.resolve({ value: new Uint8Array(chunk), done: false });
        }
        return Promise.resolve({ done: true });
      });

      await serialConnection.connect();
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(receivedTypes).toEqual(['heartbeat', 'machine', 'wave']);
    });
  });

  // Helper functions to create test packets
  function createHeartbeatPacket() {
    return [0x5A, 0x5A, 0x22, 0x06, 0xEE, 0x00];
  }

  function createMachinePacket(machineType) {
    const data = [machineType];
    const checksum = data[0];
    return [0x5A, 0x5A, 0x16, 0x07, 0xEE, checksum, ...data];
  }

  function createUpdateChannelPacket(channel) {
    const data = [channel];
    const checksum = data[0];
    return [0x5A, 0x5A, 0x15, 0x07, 0xEE, checksum, ...data];
  }

  function createWavePacket() {
    // Create a 126-byte wave packet (2 points per group)
    const packet = [0x5A, 0x5A, 0x12, 126, 0x00]; // header with channel 0
    const data = [];

    // 10 groups
    for (let g = 0; g < 10; g++) {
      // Timestamp (4 bytes, little-endian)
      const timestamp = g * 100;
      data.push(timestamp & 0xFF);
      data.push((timestamp >> 8) & 0xFF);
      data.push((timestamp >> 16) & 0xFF);
      data.push((timestamp >> 24) & 0xFF);

      // 2 points per group
      for (let p = 0; p < 2; p++) {
        // Voltage (2 bytes, little-endian)
        const voltage = 3300 + p * 10;
        data.push(voltage & 0xFF);
        data.push((voltage >> 8) & 0xFF);

        // Current (2 bytes, little-endian)
        const current = 500 + p * 5;
        data.push(current & 0xFF);
        data.push((current >> 8) & 0xFF);
      }
    }

    // Calculate checksum
    let checksum = 0;
    for (const byte of data) {
      checksum ^= byte;
    }

    packet.push(checksum);
    packet.push(...data);
    return packet;
  }

  function createSynthesizePacket() {
    // Create a 156-byte synthesize packet
    const packet = [0x5A, 0x5A, 0x11, 156, 0xEE]; // header
    const data = [];

    // 6 channels, 25 bytes each
    for (let ch = 0; ch < 6; ch++) {
      data.push(ch);                        // num
      data.push(0xDC, 0x05);               // outVoltageRaw (1500mV)
      data.push(0xF4, 0x01);               // outCurrentRaw (500mA)
      data.push(0x10, 0x0E);               // inVoltageRaw (3600mV)
      data.push(0x64, 0x00);               // inCurrentRaw (100mA)
      data.push(0xDC, 0x05);               // setVoltageRaw
      data.push(0xF4, 0x01);               // setCurrentRaw
      data.push(0xFA, 0x00);               // tempRaw (250 = 25.0°C)
      data.push(1);                        // online
      data.push(2);                        // type (P906)
      data.push(0);                        // lock
      data.push(0);                        // statusLoad/statusPsu
      data.push(ch === 0 ? 1 : 0);        // outputOn
      data.push(0, 0, 0);                  // color
      data.push(0);                        // error
      data.push(0xFF);                     // end marker
    }

    // Calculate checksum
    let checksum = 0;
    for (const byte of data) {
      checksum ^= byte;
    }

    packet.push(checksum);
    packet.push(...data);
    return packet;
  }
});
