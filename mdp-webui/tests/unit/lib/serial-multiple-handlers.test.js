/**
 * Unit tests for multiple packet handler functionality in SerialConnection
 * Tests that multiple handlers can be registered for the same packet type
 * and all handlers are called when a packet is processed
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Kaitai dependencies before importing serial.js
vi.mock('../../../src/lib/kaitai-wrapper.js', () => ({
  KaitaiStream: vi.fn(),
  MiniwareMdpM01: {
    PackType: {
      SYNTHESIZE: 17,
      WAVE: 18,
      ADDR: 19,
      UPDATE_CH: 20,
      MACHINE: 21
    }
  }
}));

vi.mock('../../../src/lib/debug-logger.js', () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(), 
  debugWarn: vi.fn(),
  logPacketData: vi.fn(),
  getPacketTypeDisplay: vi.fn((type) => `PACKET_${type}`),
  debugEnabled: { subscribe: vi.fn() }
}));

import { SerialConnection } from '../../../src/lib/serial.js';

describe('SerialConnection Multiple Handlers', () => {
  let serialConnection;
  let mockPort;
  let mockReader;
  let mockWriter;

  beforeEach(() => {
    // Mock the Web Serial API
    mockReader = {
      read: vi.fn(),
      cancel: vi.fn(),
    };
    
    mockWriter = {
      write: vi.fn(),
      close: vi.fn(),
    };
    
    mockPort = {
      open: vi.fn(),
      close: vi.fn(),
      readable: {
        getReader: vi.fn().mockReturnValue(mockReader),
      },
      writable: {
        getWriter: vi.fn().mockReturnValue(mockWriter),
      },
    };

    // Mock navigator.serial
    global.navigator = {
      serial: {
        requestPort: vi.fn().mockResolvedValue(mockPort),
      },
    };

    serialConnection = new SerialConnection();
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete global.navigator;
  });

  describe('Multiple Handler Registration', () => {
    it('should register multiple handlers for the same packet type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      // Register multiple handlers for packet type 0x11 (SYNTHESIZE)
      serialConnection.registerPacketHandler(0x11, handler1);
      serialConnection.registerPacketHandler(0x11, handler2);
      serialConnection.registerPacketHandler(0x11, handler3);

      // Check that all handlers are stored
      const handlers = serialConnection.packetHandlers.get(0x11);
      expect(handlers).toHaveLength(3);
      expect(handlers).toContain(handler1);
      expect(handlers).toContain(handler2);
      expect(handlers).toContain(handler3);
    });

    it('should maintain separate handler arrays for different packet types', () => {
      const synthesizeHandler1 = vi.fn();
      const synthesizeHandler2 = vi.fn();
      const waveHandler1 = vi.fn();
      const waveHandler2 = vi.fn();

      // Register handlers for different packet types
      serialConnection.registerPacketHandler(0x11, synthesizeHandler1); // SYNTHESIZE
      serialConnection.registerPacketHandler(0x11, synthesizeHandler2); // SYNTHESIZE
      serialConnection.registerPacketHandler(0x12, waveHandler1);       // WAVE
      serialConnection.registerPacketHandler(0x12, waveHandler2);       // WAVE

      // Check SYNTHESIZE handlers
      const synthesizeHandlers = serialConnection.packetHandlers.get(0x11);
      expect(synthesizeHandlers).toHaveLength(2);
      expect(synthesizeHandlers).toEqual([synthesizeHandler1, synthesizeHandler2]);

      // Check WAVE handlers
      const waveHandlers = serialConnection.packetHandlers.get(0x12);
      expect(waveHandlers).toHaveLength(2);
      expect(waveHandlers).toEqual([waveHandler1, waveHandler2]);
    });

    it('should allow registering the same handler function multiple times', () => {
      const handler = vi.fn();

      serialConnection.registerPacketHandler(0x11, handler);
      serialConnection.registerPacketHandler(0x11, handler);

      const handlers = serialConnection.packetHandlers.get(0x11);
      expect(handlers).toHaveLength(2);
      expect(handlers[0]).toBe(handler);
      expect(handlers[1]).toBe(handler);
    });
  });

  describe('Multiple Handler Execution', () => {
    it('should call all registered handlers when a packet is processed', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      // Register multiple handlers
      serialConnection.registerPacketHandler(0x11, handler1);
      serialConnection.registerPacketHandler(0x11, handler2);
      serialConnection.registerPacketHandler(0x11, handler3);

      // Create a valid SYNTHESIZE packet
      const packet = [
        0x5A, 0x5A,           // Header
        0x11,                 // Packet type (SYNTHESIZE)
        0x9C,                 // Size (156 bytes)
        0x00,                 // Channel
        0x3C,                 // Checksum
        ...new Array(150).fill(0) // Data payload (150 bytes to match size)
      ];

      // Process the packet
      serialConnection.handlePacket(packet);

      // Verify all handlers were called
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);

      // Verify all handlers received the same packet
      expect(handler1).toHaveBeenCalledWith(packet);
      expect(handler2).toHaveBeenCalledWith(packet);
      expect(handler3).toHaveBeenCalledWith(packet);
    });

    it('should call handlers in registration order', () => {
      const callOrder = [];
      const handler1 = vi.fn(() => callOrder.push('handler1'));
      const handler2 = vi.fn(() => callOrder.push('handler2'));
      const handler3 = vi.fn(() => callOrder.push('handler3'));

      // Register handlers in specific order
      serialConnection.registerPacketHandler(0x11, handler1);
      serialConnection.registerPacketHandler(0x11, handler2);
      serialConnection.registerPacketHandler(0x11, handler3);

      // Create a valid packet
      const packet = [0x5A, 0x5A, 0x11, 0x06, 0x00, 0x00];

      // Process the packet
      serialConnection.handlePacket(packet);

      // Verify handlers were called in registration order
      expect(callOrder).toEqual(['handler1', 'handler2', 'handler3']);
    });

    it('should continue calling remaining handlers if one handler throws an error', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn(() => {
        throw new Error('Handler 2 error');
      });
      const handler3 = vi.fn();

      // Register handlers
      serialConnection.registerPacketHandler(0x11, handler1);
      serialConnection.registerPacketHandler(0x11, handler2);
      serialConnection.registerPacketHandler(0x11, handler3);

      // Create a valid packet
      const packet = [0x5A, 0x5A, 0x11, 0x06, 0x00, 0x00];

      // Process the packet (should not throw)
      expect(() => {
        serialConnection.handlePacket(packet);
      }).not.toThrow();

      // Verify all handlers were called despite error in handler2
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should not call handlers for unregistered packet types', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      // Register handlers for packet type 0x11
      serialConnection.registerPacketHandler(0x11, handler1);
      serialConnection.registerPacketHandler(0x11, handler2);

      // Process packet with different type (0x12)
      const packet = [0x5A, 0x5A, 0x12, 0x06, 0x00, 0x00];
      serialConnection.handlePacket(packet);

      // Handlers should not be called
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should handle packets when no handlers are registered', () => {
      // Process packet with no registered handlers
      const packet = [0x5A, 0x5A, 0x11, 0x06, 0x00, 0x00];

      // Should not throw an error
      expect(() => {
        serialConnection.handlePacket(packet);
      }).not.toThrow();
    });
  });

  describe('Real-world Scenario Tests', () => {
    it('should simulate channels and timeseries handlers working together', () => {
      // Mock the channels handler
      const channelsHandler = vi.fn((packet) => {
        // Simulate updating channel state
        console.log('Channels handler updating UI state');
      });

      // Mock the timeseries handler  
      const timeseriesHandler = vi.fn((packet) => {
        // Simulate logging data points
        console.log('Timeseries handler logging data');
      });

      // Register both handlers for SYNTHESIZE packets
      serialConnection.registerPacketHandler(0x11, timeseriesHandler); // Registered first (main.js)
      serialConnection.registerPacketHandler(0x11, channelsHandler);   // Registered second (channels.js)

      // Create a realistic SYNTHESIZE packet (156 bytes)
      const synthesizePacket = [
        0x5A, 0x5A,           // Header
        0x11,                 // SYNTHESIZE packet type
        0x9C,                 // Size (156 bytes)
        0x00,                 // Channel
        0x3C,                 // Checksum
        ...new Array(150).fill(0) // 150 bytes of channel data (6 channels × 25 bytes)
      ];

      // Process the packet
      serialConnection.handlePacket(synthesizePacket);

      // Both handlers should be called
      expect(timeseriesHandler).toHaveBeenCalledTimes(1);
      expect(channelsHandler).toHaveBeenCalledTimes(1);
      expect(timeseriesHandler).toHaveBeenCalledWith(synthesizePacket);
      expect(channelsHandler).toHaveBeenCalledWith(synthesizePacket);
    });

    it('should support mixed packet types with multiple handlers', () => {
      const synthesizeHandler1 = vi.fn();
      const synthesizeHandler2 = vi.fn();
      const waveHandler1 = vi.fn();
      const machineHandler = vi.fn();

      // Register multiple handlers for different packet types
      serialConnection.registerPacketHandler(0x11, synthesizeHandler1); // SYNTHESIZE
      serialConnection.registerPacketHandler(0x11, synthesizeHandler2); // SYNTHESIZE  
      serialConnection.registerPacketHandler(0x12, waveHandler1);       // WAVE
      serialConnection.registerPacketHandler(0x15, machineHandler);     // MACHINE

      // Process different packet types
      const synthesizePacket = [0x5A, 0x5A, 0x11, 0x06, 0x00, 0x00];
      const wavePacket = [0x5A, 0x5A, 0x12, 0x06, 0x00, 0x00];
      const machinePacket = [0x5A, 0x5A, 0x15, 0x06, 0x00, 0x00];

      serialConnection.handlePacket(synthesizePacket);
      serialConnection.handlePacket(wavePacket);
      serialConnection.handlePacket(machinePacket);

      // Verify correct handlers were called
      expect(synthesizeHandler1).toHaveBeenCalledTimes(1);
      expect(synthesizeHandler2).toHaveBeenCalledTimes(1);
      expect(waveHandler1).toHaveBeenCalledTimes(1);
      expect(machineHandler).toHaveBeenCalledTimes(1);

      // Verify packets were passed correctly
      expect(synthesizeHandler1).toHaveBeenCalledWith(synthesizePacket);
      expect(synthesizeHandler2).toHaveBeenCalledWith(synthesizePacket);
      expect(waveHandler1).toHaveBeenCalledWith(wavePacket);
      expect(machineHandler).toHaveBeenCalledWith(machinePacket);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null or undefined handler gracefully', () => {
      // This should not crash (though it's not recommended usage)
      expect(() => {
        serialConnection.registerPacketHandler(0x11, null);
        serialConnection.registerPacketHandler(0x11, undefined);
      }).not.toThrow();

      const handlers = serialConnection.packetHandlers.get(0x11);
      expect(handlers).toHaveLength(2);
      expect(handlers).toEqual([null, undefined]);
    });

    it('should handle invalid packet data without crashing', () => {
      const handler = vi.fn();
      serialConnection.registerPacketHandler(0x11, handler);

      // Test with various invalid packet formats
      const invalidPackets = [
        null,
        undefined,
        [],
        [0x5A],                    // Too short
        [0x5A, 0x5A],             // Missing packet type
        [0xFF, 0xFF, 0x12],       // Invalid header (for type 0x12, not 0x11)
      ];

      invalidPackets.forEach(packet => {
        expect(() => {
          serialConnection.handlePacket(packet);
        }).not.toThrow();
      });

      // Handler should not be called for invalid packets
      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle very large numbers of handlers', () => {
      const handlers = [];
      const numHandlers = 100;

      // Register many handlers
      for (let i = 0; i < numHandlers; i++) {
        const handler = vi.fn();
        handlers.push(handler);
        serialConnection.registerPacketHandler(0x11, handler);
      }

      const packet = [0x5A, 0x5A, 0x11, 0x06, 0x00, 0x00];
      serialConnection.handlePacket(packet);

      // All handlers should be called
      handlers.forEach(handler => {
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(packet);
      });
    });
  });
});