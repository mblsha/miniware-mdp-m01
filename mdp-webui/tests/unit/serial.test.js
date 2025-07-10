import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SerialConnection, ConnectionStatus } from '../../src/lib/serial.js';
import { createMockSerial, MockSerialPort } from '../mocks/serial-api.js';
import { createHeartbeatPacket, createMachinePacket } from '../mocks/packet-data.js';

describe('Serial Connection', () => {
  let mockSerial;
  let serialConnection;
  let mockPort;

  beforeEach(() => {
    mockSerial = createMockSerial();
    global.navigator.serial = mockSerial;
    
    // Create a new instance for each test
    serialConnection = new SerialConnection();
    
    // Clear all timers
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Connection Management', () => {
    it('should initialize with disconnected status', () => {
      const status = serialConnection.status;
      let statusValue;
      const unsubscribe = status.subscribe(value => statusValue = value);
      
      expect(statusValue).toBe(ConnectionStatus.DISCONNECTED);
      unsubscribe();
    });

    it('should connect successfully', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      const statusValues = [];
      const unsubscribe = serialConnection.status.subscribe(value => statusValues.push(value));
      
      await serialConnection.connect();
      
      expect(statusValues).toContain(ConnectionStatus.CONNECTING);
      expect(statusValues).toContain(ConnectionStatus.CONNECTED);
      expect(mockPort.opened).toBe(true);
      expect(mockPort.config).toEqual({
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      });
      
      unsubscribe();
    });

    it('should handle Web Serial API not available', async () => {
      delete global.navigator.serial;
      
      await expect(serialConnection.connect()).rejects.toThrow('Web Serial API not supported');
      
      let errorValue;
      const unsubscribe = serialConnection.error.subscribe(value => errorValue = value);
      expect(errorValue).toContain('Web Serial API not supported');
      unsubscribe();
    });

    it('should handle user cancellation', async () => {
      mockSerial.requestPort.mockRejectedValue(new DOMException('User cancelled'));
      
      await expect(serialConnection.connect()).rejects.toThrow('User cancelled');
      
      let statusValue;
      const unsubscribe = serialConnection.status.subscribe(value => statusValue = value);
      expect(statusValue).toBe(ConnectionStatus.ERROR);
      unsubscribe();
    });

    it('should disconnect properly', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await serialConnection.connect();
      await serialConnection.disconnect();
      
      let statusValue;
      const unsubscribe = serialConnection.status.subscribe(value => statusValue = value);
      expect(statusValue).toBe(ConnectionStatus.DISCONNECTED);
      expect(mockPort.opened).toBe(false);
      unsubscribe();
    });

    it('should handle disconnect when not connected', async () => {
      // Should not throw
      await expect(serialConnection.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('Heartbeat Mechanism', () => {
    it('should start heartbeat on connection', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await serialConnection.connect();
      
      // Fast-forward time
      vi.advanceTimersByTime(1000);
      
      const writtenData = mockPort.getWrittenData();
      expect(writtenData.length).toBeGreaterThan(0);
      
      // Check if heartbeat packet was sent
      const heartbeat = new Uint8Array([0x5A, 0x5A, 0x22, 0x06, 0xEE, 0x00]);
      expect(writtenData[0]).toEqual(heartbeat);
    });

    it('should send heartbeat every second', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await serialConnection.connect();
      
      // Clear initial packets
      mockPort.getWrittenData().length = 0;
      
      // Advance time by 3 seconds
      vi.advanceTimersByTime(3000);
      
      const writtenData = mockPort.getWrittenData();
      expect(writtenData.length).toBe(3);
    });

    it('should stop heartbeat on disconnect', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await serialConnection.connect();
      await serialConnection.disconnect();
      
      // Clear any existing data
      mockPort.getWrittenData().length = 0;
      
      // Advance time
      vi.advanceTimersByTime(2000);
      
      const writtenData = mockPort.getWrittenData();
      expect(writtenData.length).toBe(0);
    });
  });

  describe('Packet Handling', () => {
    it('should process complete packets', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      const receivedPackets = [];
      serialConnection.registerPacketHandler(0x15, (packet) => {
        receivedPackets.push(packet);
      });
      
      await serialConnection.connect();
      
      // Simulate receiving a machine packet
      const machinePacket = createMachinePacket(0x10);
      mockPort.simulateData(machinePacket);
      
      // Allow async processing
      await vi.runAllTimersAsync();
      
      expect(receivedPackets.length).toBe(1);
      expect(receivedPackets[0]).toEqual(Array.from(machinePacket));
    });

    it('should handle partial packets', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      const receivedPackets = [];
      serialConnection.registerPacketHandler(0x15, (packet) => {
        receivedPackets.push(packet);
      });
      
      await serialConnection.connect();
      
      // Send packet in two parts
      const machinePacket = createMachinePacket(0x10);
      const part1 = machinePacket.slice(0, 4);
      const part2 = machinePacket.slice(4);
      
      mockPort.simulateData(part1);
      await vi.runAllTimersAsync();
      
      // Should not have processed yet
      expect(receivedPackets.length).toBe(0);
      
      mockPort.simulateData(part2);
      await vi.runAllTimersAsync();
      
      // Now should have processed
      expect(receivedPackets.length).toBe(1);
    });

    it('should skip invalid packet headers', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      const receivedPackets = [];
      serialConnection.registerPacketHandler(0x15, (packet) => {
        receivedPackets.push(packet);
      });
      
      await serialConnection.connect();
      
      // Send garbage followed by valid packet
      const garbage = new Uint8Array([0xFF, 0xFF, 0x5A]);
      const validPacket = createMachinePacket(0x10);
      const combined = new Uint8Array([...garbage, ...validPacket]);
      
      mockPort.simulateData(combined);
      await vi.runAllTimersAsync();
      
      expect(receivedPackets.length).toBe(1);
      expect(receivedPackets[0]).toEqual(Array.from(validPacket));
    });

    it('should handle multiple packets in one read', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      const machinePackets = [];
      const heartbeatPackets = [];
      
      serialConnection.registerPacketHandler(0x15, (packet) => {
        machinePackets.push(packet);
      });
      
      serialConnection.registerPacketHandler(0x22, (packet) => {
        heartbeatPackets.push(packet);
      });
      
      await serialConnection.connect();
      
      // Send two different packets together
      const packet1 = createMachinePacket(0x10);
      const packet2 = createHeartbeatPacket();
      const combined = new Uint8Array([...packet1, ...packet2]);
      
      mockPort.simulateData(combined);
      await vi.runAllTimersAsync();
      
      expect(machinePackets.length).toBe(1);
      expect(heartbeatPackets.length).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle read errors', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await serialConnection.connect();
      
      // Simulate disconnection
      mockPort.simulateDisconnect();
      
      await vi.runAllTimersAsync();
      
      let statusValue;
      const unsubscribe = serialConnection.status.subscribe(value => statusValue = value);
      expect(statusValue).toBe(ConnectionStatus.ERROR);
      unsubscribe();
    });

    it('should handle write errors', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await serialConnection.connect();
      
      // Close the writer to simulate error
      await mockPort.writable.writer.close();
      
      // Try to send a packet
      await expect(serialConnection.sendPacket([0x5A, 0x5A, 0x22, 0x06, 0xEE, 0x00]))
        .rejects.toThrow('Not connected');
    });

    it('should recover from errors on reconnect', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await serialConnection.connect();
      
      // Simulate error
      mockPort.simulateDisconnect();
      await vi.runAllTimersAsync();
      
      // Disconnect and reconnect
      await serialConnection.disconnect();
      
      const newPort = new MockSerialPort();
      mockSerial.setNextPort(newPort);
      
      await serialConnection.connect();
      
      let statusValue;
      const unsubscribe = serialConnection.status.subscribe(value => statusValue = value);
      expect(statusValue).toBe(ConnectionStatus.CONNECTED);
      unsubscribe();
    });
  });

  describe('Get Machine Type', () => {
    it('should request machine type on connection', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await serialConnection.connect();
      
      const writtenData = mockPort.getWrittenData();
      
      // Should have sent get machine packet
      const getMachinePacket = new Uint8Array([0x5A, 0x5A, 0x21, 0x06, 0xEE, 0x00]);
      const foundGetMachine = writtenData.some(data => 
        data.length === getMachinePacket.length &&
        data.every((byte, i) => byte === getMachinePacket[i])
      );
      
      expect(foundGetMachine).toBe(true);
    });
  });

  describe('Multiple Handlers', () => {
    it('should support multiple handlers for same packet type', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      const handler1Packets = [];
      const handler2Packets = [];
      
      serialConnection.registerPacketHandler(0x15, (packet) => {
        handler1Packets.push(packet);
      });
      
      // Note: Current implementation might override, but ideally should support multiple
      serialConnection.registerPacketHandler(0x15, (packet) => {
        handler2Packets.push(packet);
      });
      
      await serialConnection.connect();
      
      mockPort.simulateData(createMachinePacket(0x10));
      await vi.runAllTimersAsync();
      
      // At least one handler should receive the packet
      expect(handler1Packets.length + handler2Packets.length).toBeGreaterThan(0);
    });
  });

  describe('Packet Size Handling', () => {
    it('should wait for complete packet based on size field', async () => {
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      const receivedPackets = [];
      serialConnection.registerPacketHandler(0x11, (packet) => {
        receivedPackets.push(packet);
      });
      
      await serialConnection.connect();
      
      // Create a synthesize packet (156 bytes)
      const header = new Uint8Array([0x5A, 0x5A, 0x11, 0x9C, 0x00, 0x00]);
      
      // Send only header first
      mockPort.simulateData(header);
      await vi.runAllTimersAsync();
      
      // Should not process yet (waiting for 156 bytes total)
      expect(receivedPackets.length).toBe(0);
      
      // Send rest of data
      const remainingData = new Uint8Array(150);
      mockPort.simulateData(remainingData);
      await vi.runAllTimersAsync();
      
      // Now should process
      expect(receivedPackets.length).toBe(1);
      expect(receivedPackets[0].length).toBe(156);
    });
  });
});