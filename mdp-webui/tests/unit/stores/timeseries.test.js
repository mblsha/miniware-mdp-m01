import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { timeseriesStore } from '$lib/stores/timeseries.js';

describe('TimeseriesStore', () => {
  beforeEach(() => {
    // Reset store before each test
    timeseriesStore.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Clean up timers
    timeseriesStore.stopAutoCleanup();
    vi.useRealTimers();
  });

  describe('Session Management', () => {
    it('should create a new session with unique ID', () => {
      const sessionId = timeseriesStore.createSession([0, 1, 2]);
      expect(sessionId).toMatch(/^session-\d+-[a-z0-9]+$/);
      
      const sessions = get(timeseriesStore.sessionList);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(sessionId);
      expect(sessions[0].channels).toEqual(new Set([0, 1, 2]));
    });

    it('should auto-activate first session', () => {
      const sessionId = timeseriesStore.createSession([0]);
      const activeSession = get(timeseriesStore.activeSession);
      expect(activeSession).toBeTruthy();
      expect(activeSession.id).toBe(sessionId);
    });

    it('should not auto-activate if session already active', () => {
      const sessionId1 = timeseriesStore.createSession([0]);
      const sessionId2 = timeseriesStore.createSession([1]);
      
      const activeSession = get(timeseriesStore.activeSession);
      expect(activeSession.id).toBe(sessionId1);
    });

    it('should close session and update endTime', () => {
      const sessionId = timeseriesStore.createSession([0]);
      const now = Date.now();
      
      timeseriesStore.closeSession(sessionId);
      
      const sessions = get(timeseriesStore.sessionList);
      expect(sessions[0].endTime).toBeGreaterThanOrEqual(now);
      expect(get(timeseriesStore.activeSession)).toBeNull();
    });

    it('should switch active session', () => {
      const sessionId1 = timeseriesStore.createSession([0]);
      const sessionId2 = timeseriesStore.createSession([1]);
      
      timeseriesStore.setActiveSession(sessionId2);
      
      const activeSession = get(timeseriesStore.activeSession);
      expect(activeSession.id).toBe(sessionId2);
    });
  });

  describe('Data Point Management', () => {
    it('should add single data point', () => {
      const sessionId = timeseriesStore.createSession([0]);
      const timestamp = Date.now();
      const data = {
        voltage: 3.3,
        current: 0.5,
        temperature: 25.5,
        mode: 'CV',
        isOutput: true
      };
      
      timeseriesStore.addDataPoint(0, timestamp, data);
      
      const sessionData = get(timeseriesStore.activeSessionData);
      expect(sessionData).toHaveLength(1);
      expect(sessionData[0].timestamp).toBe(timestamp);
      expect(sessionData[0].ch0).toEqual({
        voltage: 3.3,
        current: 0.5,
        power: 1.65,
        temperature: 25.5,
        mode: 'CV',
        isOutput: true
      });
    });

    it('should correlate multiple channels at same timestamp', () => {
      const sessionId = timeseriesStore.createSession([0, 1, 2]);
      const timestamp = Date.now();
      
      timeseriesStore.addDataPoint(0, timestamp, { voltage: 3.3, current: 0.5 });
      timeseriesStore.addDataPoint(1, timestamp, { voltage: 5.0, current: 1.0 });
      timeseriesStore.addDataPoint(2, timestamp, { voltage: 12.0, current: 0.25 });
      
      const sessionData = get(timeseriesStore.activeSessionData);
      expect(sessionData).toHaveLength(1);
      expect(sessionData[0]).toMatchObject({
        timestamp,
        ch0: { voltage: 3.3, current: 0.5, power: 1.65 },
        ch1: { voltage: 5.0, current: 1.0, power: 5.0 },
        ch2: { voltage: 12.0, current: 0.25, power: 3.0 }
      });
    });

    it('should add batch data points efficiently', () => {
      const sessionId = timeseriesStore.createSession([0, 1]);
      const baseTime = Date.now();
      
      const points = [];
      for (let i = 0; i < 100; i++) {
        points.push({
          channel: 0,
          timestamp: baseTime + i * 10,
          data: { voltage: 3.3 + i * 0.01, current: 0.5 }
        });
        points.push({
          channel: 1,
          timestamp: baseTime + i * 10,
          data: { voltage: 5.0, current: 1.0 - i * 0.001 }
        });
      }
      
      timeseriesStore.addDataPoints(points);
      
      const sessionData = get(timeseriesStore.activeSessionData);
      expect(sessionData).toHaveLength(100);
      expect(sessionData[0].ch0.voltage).toBe(3.3);
      expect(sessionData[99].ch0.voltage).toBe(4.29);
    });

    it('should update session metadata correctly', () => {
      const sessionId = timeseriesStore.createSession([0]);
      const baseTime = Date.now();
      
      timeseriesStore.addDataPoint(0, baseTime + 100, { voltage: 3.3, current: 0.5 });
      timeseriesStore.addDataPoint(0, baseTime + 50, { voltage: 3.3, current: 0.5 });
      timeseriesStore.addDataPoint(0, baseTime + 150, { voltage: 3.3, current: 0.5 });
      
      const session = get(timeseriesStore.activeSession);
      expect(session.metadata.minTimestamp).toBe(baseTime + 50);
      expect(session.metadata.maxTimestamp).toBe(baseTime + 150);
      expect(session.pointCount).toBe(3);
    });

    it('should calculate sample rate from first samples', () => {
      const sessionId = timeseriesStore.createSession([0]);
      const baseTime = Date.now();
      
      // Add 15 points with 10ms intervals (100Hz)
      for (let i = 0; i < 15; i++) {
        timeseriesStore.addDataPoint(0, baseTime + i * 10, { voltage: 3.3, current: 0.5 });
      }
      
      const session = get(timeseriesStore.activeSession);
      expect(session.metadata.sampleRate).toBeCloseTo(100, 1);
    });
  });

  describe('Data Retrieval', () => {
    it('should retrieve data within time range', () => {
      const sessionId = timeseriesStore.createSession([0, 1]);
      const baseTime = Date.now();
      
      // Add data points
      for (let i = 0; i < 100; i++) {
        timeseriesStore.addDataPoint(0, baseTime + i * 10, { voltage: 3.3, current: 0.5 });
        timeseriesStore.addDataPoint(1, baseTime + i * 10, { voltage: 5.0, current: 1.0 });
      }
      
      // Get middle 50 points
      const data = timeseriesStore.getDataRange(baseTime + 250, baseTime + 750);
      expect(data).toHaveLength(51); // Points 25 through 75
      expect(data[0].timestamp).toBe(baseTime + 250);
      expect(data[50].timestamp).toBe(baseTime + 750);
    });

    it('should filter by channels when retrieving', () => {
      const sessionId = timeseriesStore.createSession([0, 1, 2]);
      const baseTime = Date.now();
      
      // Add data for all channels
      for (let i = 0; i < 10; i++) {
        timeseriesStore.addDataPoint(0, baseTime + i * 10, { voltage: 3.3, current: 0.5 });
        timeseriesStore.addDataPoint(1, baseTime + i * 10, { voltage: 5.0, current: 1.0 });
        timeseriesStore.addDataPoint(2, baseTime + i * 10, { voltage: 12.0, current: 0.25 });
      }
      
      // Get only channel 0 and 2
      const data = timeseriesStore.getDataRange(baseTime, baseTime + 100, [0, 2]);
      expect(data).toHaveLength(10);
      data.forEach(point => {
        expect(point.data).toHaveProperty('ch0');
        expect(point.data).not.toHaveProperty('ch1');
        expect(point.data).toHaveProperty('ch2');
      });
    });

    it('should return empty array for invalid session', () => {
      const data = timeseriesStore.getDataRange(0, Date.now());
      expect(data).toEqual([]);
    });
  });

  describe('Memory Management', () => {
    it('should respect max points limit', () => {
      timeseriesStore.updateConfig({ maxPoints: 10 });
      const sessionId = timeseriesStore.createSession([0]);
      
      // Try to add 20 points
      for (let i = 0; i < 20; i++) {
        timeseriesStore.addDataPoint(0, Date.now() + i, { voltage: 3.3, current: 0.5 });
      }
      
      const session = get(timeseriesStore.activeSession);
      expect(session.pointCount).toBe(10);
    });

    it('should clean up old sessions', () => {
      timeseriesStore.updateConfig({ maxDuration: 1000 }); // 1 second
      
      // Create and close old session
      const oldSessionId = timeseriesStore.createSession([0]);
      timeseriesStore.closeSession(oldSessionId);
      
      // Create new active session
      const newSessionId = timeseriesStore.createSession([1]);
      
      // Advance time and cleanup
      vi.advanceTimersByTime(2000);
      timeseriesStore.cleanupOldData();
      
      const sessions = get(timeseriesStore.sessionList);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(newSessionId);
    });

    it('should clean up old data points within session', () => {
      timeseriesStore.updateConfig({ maxDuration: 1000 }); // 1 second
      const sessionId = timeseriesStore.createSession([0]);
      const baseTime = Date.now();
      
      // Add old and new data points
      timeseriesStore.addDataPoint(0, baseTime - 2000, { voltage: 3.3, current: 0.5 });
      timeseriesStore.addDataPoint(0, baseTime - 500, { voltage: 3.3, current: 0.5 });
      timeseriesStore.addDataPoint(0, baseTime, { voltage: 3.3, current: 0.5 });
      
      // Use reference time for consistent cleanup
      timeseriesStore.cleanupOldData(baseTime);
      
      const session = get(timeseriesStore.activeSession);
      expect(session.pointCount).toBe(2); // Only recent points remain
      expect(session.metadata.minTimestamp).toBe(baseTime - 500);
    });

    it('should auto cleanup with interval', () => {
      // Create old session data that should be cleaned up
      timeseriesStore.updateConfig({ autoCleanup: true, maxDuration: 1000 });
      const sessionId = timeseriesStore.createSession([0]);
      timeseriesStore.closeSession(sessionId);
      
      // Verify session exists
      let sessions = get(timeseriesStore.sessionList);
      expect(sessions).toHaveLength(1);
      
      // Start auto cleanup
      timeseriesStore.startAutoCleanup();
      
      // Advance time past the cleanup interval and max duration
      vi.advanceTimersByTime(62000); // Just over 1 minute
      
      // Session should be cleaned up
      sessions = get(timeseriesStore.sessionList);
      expect(sessions).toHaveLength(0);
    });
  });

  describe('Configuration', () => {
    it('should update configuration', () => {
      timeseriesStore.updateConfig({
        maxDuration: 7200000,
        maxPoints: 50000,
        autoCleanup: false
      });
      
      const store = get(timeseriesStore);
      expect(store.config.maxDuration).toBe(7200000);
      expect(store.config.maxPoints).toBe(50000);
      expect(store.config.autoCleanup).toBe(false);
    });
  });

  describe('Derived Stores', () => {
    it('should provide sorted session list', () => {
      // Create sessions with time gaps
      const session1 = timeseriesStore.createSession([0]);
      vi.advanceTimersByTime(1000);
      const session2 = timeseriesStore.createSession([1]);
      vi.advanceTimersByTime(1000);
      const session3 = timeseriesStore.createSession([2]);
      
      const sessions = get(timeseriesStore.sessionList);
      expect(sessions).toHaveLength(3);
      expect(sessions[0].id).toBe(session3); // Most recent first
      expect(sessions[1].id).toBe(session2);
      expect(sessions[2].id).toBe(session1);
    });

    it('should provide active session data sorted by timestamp', () => {
      const sessionId = timeseriesStore.createSession([0]);
      const baseTime = Date.now();
      
      // Add data in random order
      timeseriesStore.addDataPoint(0, baseTime + 50, { voltage: 3.3, current: 0.5 });
      timeseriesStore.addDataPoint(0, baseTime + 10, { voltage: 3.3, current: 0.5 });
      timeseriesStore.addDataPoint(0, baseTime + 30, { voltage: 3.3, current: 0.5 });
      
      const data = get(timeseriesStore.activeSessionData);
      expect(data[0].timestamp).toBe(baseTime + 10);
      expect(data[1].timestamp).toBe(baseTime + 30);
      expect(data[2].timestamp).toBe(baseTime + 50);
    });
  });

  describe('Edge Cases', () => {
    it('should handle adding data without active session', () => {
      // No session created
      expect(() => {
        timeseriesStore.addDataPoint(0, Date.now(), { voltage: 3.3, current: 0.5 });
      }).not.toThrow();
      
      const sessions = get(timeseriesStore.sessionList);
      expect(sessions).toHaveLength(0);
    });

    it('should handle invalid session operations', () => {
      expect(() => {
        timeseriesStore.closeSession('invalid-session-id');
        timeseriesStore.setActiveSession('invalid-session-id');
      }).not.toThrow();
    });

    it('should handle empty data retrieval', () => {
      const sessionId = timeseriesStore.createSession([0]);
      const data = timeseriesStore.getDataRange(0, Date.now());
      expect(data).toEqual([]);
    });

    it('should preserve data integrity with concurrent updates', () => {
      const sessionId = timeseriesStore.createSession([0, 1]);
      const timestamp = Date.now();
      
      // Simulate concurrent updates
      timeseriesStore.addDataPoint(0, timestamp, { voltage: 3.3, current: 0.5 });
      timeseriesStore.addDataPoint(1, timestamp, { voltage: 5.0, current: 1.0 });
      timeseriesStore.addDataPoint(0, timestamp, { voltage: 3.4, current: 0.6 }); // Overwrite
      
      const data = get(timeseriesStore.activeSessionData);
      expect(data[0].ch0.voltage).toBe(3.4); // Latest value
      expect(data[0].ch0.current).toBe(0.6);
      expect(data[0].ch1.voltage).toBe(5.0); // Unchanged
    });
  });

  describe('Reset Functionality', () => {
    it('should completely reset store state', () => {
      // Create some data
      const sessionId = timeseriesStore.createSession([0]);
      timeseriesStore.addDataPoint(0, Date.now(), { voltage: 3.3, current: 0.5 });
      timeseriesStore.updateConfig({ maxPoints: 5000 });
      
      // Reset
      timeseriesStore.reset();
      
      // Verify clean state
      expect(get(timeseriesStore.sessionList)).toHaveLength(0);
      expect(get(timeseriesStore.activeSession)).toBeNull();
      const store = get(timeseriesStore);
      expect(store.config.maxPoints).toBe(100000); // Default value
    });
  });
});