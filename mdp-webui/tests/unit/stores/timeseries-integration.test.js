import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock kaitai-wrapper before importing anything that uses it
vi.mock('../../../src/lib/kaitai-wrapper.js', () => ({
  KaitaiStream: vi.fn(),
  MiniwareMdpM01: {
    PackType: {
      PACK_HEARTBEAT: 0x22,
      PACK_SET_CH: 0x19,
      PACK_SET_V: 0x1A,
      PACK_SET_I: 0x1B,
      PACK_SET_ADDR: 0x18,
      PACK_SET_ALL_ADDR: 0x1C,
      PACK_SET_ISOUTPUT: 0x16,
      PACK_SYNTHESIZE: 0x11,
      PACK_WAVE: 0x12,
      PACK_ADDR: 0x13,
      PACK_UPDAT_CH: 0x14,
      PACK_MACHINE: 0x15,
      PACK_ERR_240: 0x23
    }
  }
}));

// Mock the serial connection
vi.mock('../../../src/lib/serial.js', () => ({
  serialConnection: {
    registerPacketHandler: vi.fn(),
    getDecoder: vi.fn(() => ({
      decodeSynthesize: vi.fn(),
      decodeWave: vi.fn()
    }))
  }
}));

import { timeseriesStore } from '../../../src/lib/stores/timeseries.js';
import { channelStore } from '../../../src/lib/stores/channels.js';
import { serialConnection } from '../../../src/lib/serial.js';

describe('TimeseriesIntegration', () => {
  let mockHandlers;
  let integration;

  beforeEach(async () => {
    // Reset stores
    timeseriesStore.reset();
    channelStore.reset();
    
    // Clear mock data
    vi.clearAllMocks();
    mockHandlers = new Map();
    
    // Capture registered handlers
    serialConnection.registerPacketHandler.mockImplementation((type, handler) => {
      if (!mockHandlers.has(type)) {
        mockHandlers.set(type, []);
      }
      mockHandlers.get(type).push(handler);
    });
    
    // Dynamically import integration module to ensure fresh initialization
    integration = await import('../../../src/lib/stores/timeseries-integration.js');
  });

  afterEach(() => {
    timeseriesStore.stopAutoCleanup();
  });

  describe('Packet Handler Integration', () => {
    it('should register handlers for synthesize and wave packets', () => {
      expect(serialConnection.registerPacketHandler).toHaveBeenCalledWith(0x11, expect.any(Function));
      expect(serialConnection.registerPacketHandler).toHaveBeenCalledWith(0x12, expect.any(Function));
      expect(mockHandlers.has(0x11)).toBe(true);
      expect(mockHandlers.has(0x12)).toBe(true);
      expect(mockHandlers.get(0x11)).toHaveLength(1);
      expect(mockHandlers.get(0x12)).toHaveLength(1);
    });

    it('should process synthesize packets when session is active', () => {
      // Create recording session
      const sessionId = integration.startRecording([0, 1, 2]);
      
      // Mock synthesize packet data
      const mockDecoder = serialConnection.getDecoder();
      mockDecoder.decodeSynthesize.mockReturnValue({
        data: {
          channels: [
            { outVoltage: 3.3, outCurrent: 0.5, temperature: 25.5, outputOn: 1 },
            { outVoltage: 5.0, outCurrent: 1.0, temperature: 26.0, outputOn: 1 },
            { outVoltage: 12.0, outCurrent: 0.25, temperature: 24.0, outputOn: 0 }
          ]
        }
      });
      
      // Simulate synthesize packet
      const handlers = mockHandlers.get(0x11);
      expect(handlers).toBeTruthy();
      expect(handlers).toHaveLength(1);
      const synthHandler = handlers[0];
      synthHandler([0x5A, 0x5A, 0x11, 156, 0, 0]); // Mock packet header
      
      // Verify data was stored
      const sessionData = get(timeseriesStore.activeSessionData);
      expect(sessionData).toHaveLength(1);
      expect(sessionData[0]).toMatchObject({
        ch0: { voltage: 3.3, current: 0.5, temperature: 25.5, isOutput: true },
        ch1: { voltage: 5.0, current: 1.0, temperature: 26.0, isOutput: true },
        ch2: { voltage: 12.0, current: 0.25, temperature: 24.0, isOutput: false }
      });
    });

    it('should process wave packets for active channels', () => {
      // Create recording session for channel 0
      const sessionId = integration.startRecording([0]);
      
      // Mock wave packet data
      const mockDecoder = serialConnection.getDecoder();
      mockDecoder.decodeWave.mockReturnValue({
        data: {
          groups: [
            {
              timestamp: 1000,
              items: [
                { voltage: 3.3, current: 0.5 },
                { voltage: 3.31, current: 0.51 }
              ]
            },
            {
              timestamp: 1020,
              items: [
                { voltage: 3.32, current: 0.52 },
                { voltage: 3.33, current: 0.53 }
              ]
            }
          ]
        }
      });
      
      // Simulate wave packet for channel 0
      const waveHandler = mockHandlers.get(0x12)[0];
      waveHandler([0x5A, 0x5A, 0x12, 126, 0, 0]); // Channel 0 in header
      
      // Verify data was stored with correct timestamps
      const sessionData = get(timeseriesStore.activeSessionData);
      expect(sessionData).toHaveLength(4);
      expect(sessionData[0]).toMatchObject({
        timestamp: 1000,
        ch0: { voltage: 3.3, current: 0.5 }
      });
      expect(sessionData[1]).toMatchObject({
        timestamp: 1010,
        ch0: { voltage: 3.31, current: 0.51 }
      });
      expect(sessionData[2]).toMatchObject({
        timestamp: 1020,
        ch0: { voltage: 3.32, current: 0.52 }
      });
      expect(sessionData[3]).toMatchObject({
        timestamp: 1030,
        ch0: { voltage: 3.33, current: 0.53 }
      });
    });

    it('should ignore packets when no active session', () => {
      const mockDecoder = serialConnection.getDecoder();
      mockDecoder.decodeSynthesize.mockReturnValue({
        data: { channels: [{ outVoltage: 3.3, outCurrent: 0.5 }] }
      });
      
      // No session created - packets should be ignored
      const synthHandler = mockHandlers.get(0x11)[0];
      synthHandler([0x5A, 0x5A, 0x11, 156, 0, 0]);
      
      const sessions = get(timeseriesStore.sessionList);
      expect(sessions).toHaveLength(0);
    });
  });

  describe('Recording Control', () => {
    it('should start recording with specified channels', () => {
      const sessionId = integration.startRecording([0, 2, 4]);
      
      expect(sessionId).toBeTruthy();
      const activeSession = get(timeseriesStore.activeSession);
      expect(activeSession).toBeTruthy();
      expect(activeSession.channels).toEqual(new Set([0, 2, 4]));
      
      // Check channel store recording state
      const channels = get(channelStore.channels);
      expect(channels[0].recording).toBe(true);
      expect(channels[1].recording).toBe(false);
      expect(channels[2].recording).toBe(true);
      expect(channels[3].recording).toBe(false);
      expect(channels[4].recording).toBe(true);
    });

    it('should stop recording and close session', () => {
      const sessionId = integration.startRecording([0, 1]);
      integration.stopRecording();
      
      // Check session is closed
      const activeSession = get(timeseriesStore.activeSession);
      expect(activeSession).toBeNull();
      
      // Check channels are not recording
      const channels = get(channelStore.channels);
      channels.forEach(ch => {
        expect(ch.recording).toBe(false);
      });
      
      // Session should still exist but be closed
      const sessions = get(timeseriesStore.sessionList);
      expect(sessions[0].endTime).toBeTruthy();
    });
  });

  describe('Data Export', () => {
    it('should export session data to CSV', () => {
      // Create session and add data
      const sessionId = integration.startRecording([0, 1]);
      const baseTime = Date.now();
      
      timeseriesStore.addDataPoints([
        { channel: 0, timestamp: baseTime, data: { voltage: 3.3, current: 0.5 } },
        { channel: 1, timestamp: baseTime, data: { voltage: 5.0, current: 1.0 } },
        { channel: 0, timestamp: baseTime + 100, data: { voltage: 3.31, current: 0.51 } },
        { channel: 1, timestamp: baseTime + 100, data: { voltage: 5.01, current: 1.01 } }
      ]);
      
      const csv = integration.exportSessionToCSV();
      const lines = csv.split('\n');
      
      expect(lines[0]).toBe('Timestamp (ms),Time (s),Ch0 Voltage (V),Ch0 Current (A),Ch0 Power (W),Ch1 Voltage (V),Ch1 Current (A),Ch1 Power (W)');
      expect(lines[1]).toContain('0.000'); // First timestamp at 0s
      expect(lines[2]).toContain('0.100'); // Second timestamp at 0.1s
      expect(lines[1]).toContain('3.300,0.500,1.650,5.000,1.000,5.000');
    });

    it('should export specific channels only', () => {
      const sessionId = integration.startRecording([0, 1, 2]);
      const baseTime = Date.now();
      
      timeseriesStore.addDataPoint(0, baseTime, { voltage: 3.3, current: 0.5 });
      timeseriesStore.addDataPoint(1, baseTime, { voltage: 5.0, current: 1.0 });
      timeseriesStore.addDataPoint(2, baseTime, { voltage: 12.0, current: 0.25 });
      
      const csv = integration.exportSessionToCSV(sessionId, [0, 2]);
      const lines = csv.split('\n');
      
      expect(lines[0]).toBe('Timestamp (ms),Time (s),Ch0 Voltage (V),Ch0 Current (A),Ch0 Power (W),Ch2 Voltage (V),Ch2 Current (A),Ch2 Power (W)');
      expect(lines[1]).not.toContain('5.000'); // Channel 1 data excluded
    });
  });

  describe('Chart Data Retrieval', () => {
    it('should get chart data for active session', () => {
      const sessionId = integration.startRecording([0]);
      const baseTime = Date.now();
      
      // Add data points
      for (let i = 0; i < 10; i++) {
        timeseriesStore.addDataPoint(0, baseTime + i * 100, {
          voltage: 3.3 + i * 0.1,
          current: 0.5 + i * 0.01
        });
      }
      
      const chartData = integration.getChartData(0, 10000); // Get last 10 seconds
      
      expect(chartData.timestamps).toHaveLength(10);
      expect(chartData.voltage).toHaveLength(10);
      expect(chartData.current).toHaveLength(10);
      expect(chartData.power).toHaveLength(10);
      
      expect(chartData.voltage[0]).toBe(3.3);
      expect(chartData.voltage[9]).toBe(4.2);
      expect(chartData.power[0]).toBeCloseTo(1.65, 2);
    });

    it('should return empty data for inactive channel', () => {
      integration.startRecording([0]);
      const chartData = integration.getChartData(1); // Channel 1 not recording
      
      expect(chartData.timestamps).toHaveLength(0);
      expect(chartData.voltage).toHaveLength(0);
    });
  });

  describe('Session Statistics', () => {
    it('should calculate session statistics', () => {
      const sessionId = integration.startRecording([0, 1]);
      const baseTime = Date.now();
      
      // Add varied data
      for (let i = 0; i < 10; i++) {
        timeseriesStore.addDataPoint(0, baseTime + i * 100, {
          voltage: 3.0 + i * 0.1, // 3.0 to 3.9
          current: 0.5 - i * 0.01  // 0.5 to 0.41
        });
        timeseriesStore.addDataPoint(1, baseTime + i * 100, {
          voltage: 5.0,
          current: 1.0 + i * 0.02 // 1.0 to 1.18
        });
      }
      
      const stats = integration.getSessionStats();
      
      expect(stats).toBeTruthy();
      expect(stats.channels).toEqual([0, 1]);
      expect(stats.pointCount).toBe(10);
      
      // Channel 0 stats
      expect(stats.channelStats[0].voltage.min).toBe(3.0);
      expect(stats.channelStats[0].voltage.max).toBe(3.9);
      expect(stats.channelStats[0].voltage.avg).toBeCloseTo(3.45, 2);
      expect(stats.channelStats[0].current.min).toBeCloseTo(0.41, 2);
      expect(stats.channelStats[0].current.max).toBe(0.5);
      
      // Channel 1 stats
      expect(stats.channelStats[1].voltage.min).toBe(5.0);
      expect(stats.channelStats[1].voltage.max).toBe(5.0);
      expect(stats.channelStats[1].current.min).toBe(1.0);
      expect(stats.channelStats[1].current.max).toBe(1.18);
    });

    it('should handle empty session stats', () => {
      const stats = integration.getSessionStats();
      expect(stats).toBeNull();
    });
  });
});