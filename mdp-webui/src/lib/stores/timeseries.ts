import { writable, derived, get, type Writable, type Readable } from 'svelte/store';

// Type for timer - use any to avoid NodeJS dependency issues

/**
 * Centralized time-series data store for all channel data
 * Stores data points with timestamp correlation across channels
 */

// Type definitions
interface ChannelDataPoint {
  voltage: number;
  current: number;
  power: number;
  temperature: number | null;
  mode: string | null;
  isOutput: boolean;
}

interface SessionMetadata {
  createdAt: Date;
  sampleRate: number | null;
  minTimestamp: number | null;
  maxTimestamp: number | null;
}

interface Session {
  id: string;
  startTime: number;
  endTime: number | null;
  channels: Set<number>;
  data: Map<number, Record<string, ChannelDataPoint>>;
  pointCount: number;
  metadata: SessionMetadata;
}

interface TimeseriesConfig {
  maxDuration: number;
  maxPoints: number;
  autoCleanup: boolean;
}

interface TimeseriesState {
  sessions: Map<string, Session>;
  activeSessionId: string | null;
  config: TimeseriesConfig;
}

interface DataPoint {
  channel: number;
  timestamp: number;
  data: {
    voltage: number;
    current: number;
    temperature?: number;
    mode?: string;
    isOutput?: boolean;
  };
}

interface TimeRangePoint {
  timestamp: number;
  data: Record<string, ChannelDataPoint>;
}

interface TimeseriesStore {
  subscribe: Writable<TimeseriesState>['subscribe'];
  createSession: (channels?: number[]) => string;
  addDataPoint: (channel: number, timestamp: number, data: DataPoint['data'], sessionId?: string | null) => void;
  addDataPoints: (points: DataPoint[], sessionId?: string | null) => void;
  getDataRange: (startTime: number, endTime: number, channels?: number[] | null, sessionId?: string | null) => TimeRangePoint[];
  closeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  updateConfig: (config: Partial<TimeseriesConfig>) => void;
  cleanupOldData: (referenceTime?: number | null) => void;
  startAutoCleanup: () => void;
  stopAutoCleanup: () => void;
  reset: () => void;
  activeSession: Readable<Session | null>;
  sessionList: Readable<Session[]>;
  activeSessionData: Readable<Array<{ timestamp: number } & Record<string, ChannelDataPoint>>>;
}

// Configuration constants
const DEFAULT_MAX_DURATION = 3600000; // 1 hour in milliseconds
const DEFAULT_MAX_POINTS = 100000;   // Maximum data points per session
const CLEANUP_INTERVAL = 60000;      // Cleanup old data every minute

// Helper to generate unique session IDs
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Initialize the store state
function createInitialState(): TimeseriesState {
  return {
    sessions: new Map(),
    activeSessionId: null,
    config: {
      maxDuration: DEFAULT_MAX_DURATION,
      maxPoints: DEFAULT_MAX_POINTS,
      autoCleanup: true
    }
  };
}

// Create the main store
const store: Writable<TimeseriesState> = writable(createInitialState());

// Keep track of cleanup interval
let cleanupTimer: any = null;

/**
 * Create a new recording session
 * @param {Array<number>} channels - Array of channel numbers to record
 * @returns {string} The new session ID
 */
function createSession(channels: number[] = []): string {
  const sessionId = generateSessionId();
  const startTime = Date.now();
  
  store.update(state => {
    state.sessions.set(sessionId, {
      id: sessionId,
      startTime,
      endTime: null,
      channels: new Set(channels),
      data: new Map(), // Map<timestamp, channelData>
      pointCount: 0,
      metadata: {
        createdAt: new Date(startTime),
        sampleRate: null, // Will be calculated from first few samples
        minTimestamp: null,
        maxTimestamp: null
      }
    });
    
    // Auto-activate if no active session
    if (!state.activeSessionId) {
      state.activeSessionId = sessionId;
    }
    
    return state;
  });
  
  return sessionId;
}

/**
 * Add a data point for a specific channel
 * @param {number} channel - Channel number
 * @param {number} timestamp - Timestamp in milliseconds
 * @param {Object} data - Data object with voltage, current, etc.
 * @param {string} sessionId - Optional session ID (uses active if not provided)
 */
function applyChannelData(state: TimeseriesState, session: Session, timestamp: number, channelData: Record<string, ChannelDataPoint>): void {
  if (session.pointCount >= state.config.maxPoints) {
    return;
  }

  if (!session.data.has(timestamp)) {
    session.data.set(timestamp, {});
    session.pointCount++;
  }

  Object.assign(session.data.get(timestamp), channelData);

  if (!session.metadata.minTimestamp || timestamp < session.metadata.minTimestamp) {
    session.metadata.minTimestamp = timestamp;
  }
  if (!session.metadata.maxTimestamp || timestamp > session.metadata.maxTimestamp) {
    session.metadata.maxTimestamp = timestamp;
  }

  if (!session.metadata.sampleRate && session.data.size > 10) {
    const timestamps = Array.from(session.data.keys()).sort((a, b) => a - b);
    const intervals = [];
    for (let i = 1; i < Math.min(10, timestamps.length); i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    session.metadata.sampleRate = avgInterval > 0 ? 1000 / avgInterval : null;
  }
}

function addDataPoint(channel: number, timestamp: number, data: DataPoint['data'], sessionId: string | null = null): void {
  store.update(state => {
    const targetSessionId = sessionId || state.activeSessionId;
    if (!targetSessionId || !state.sessions.has(targetSessionId)) {
      return state;
    }

    const session = state.sessions.get(targetSessionId);

    applyChannelData(state, session, timestamp, {
      [`ch${channel}`]: {
        voltage: data.voltage,
        current: data.current,
        power: data.voltage * data.current,
        temperature: data.temperature || null,
        mode: data.mode || null,
        isOutput: data.isOutput || false
      }
    });

    return state;
  });
}

/**
 * Add multiple data points in batch
 * @param {Array<{channel, timestamp, data}>} points - Array of data points
 * @param {string} sessionId - Optional session ID
 */
function addDataPoints(points: DataPoint[], sessionId: string | null = null): void {
  store.update(state => {
    const targetSessionId = sessionId || state.activeSessionId;
    if (!targetSessionId || !state.sessions.has(targetSessionId)) {
      return state;
    }

    const session = state.sessions.get(targetSessionId);

    const groupedPoints = new Map<number, Record<string, ChannelDataPoint>>();
    points.forEach(point => {
      if (!groupedPoints.has(point.timestamp)) {
        groupedPoints.set(point.timestamp, {});
      }
      groupedPoints.get(point.timestamp)[`ch${point.channel}`] = {
        voltage: point.data.voltage,
        current: point.data.current,
        power: point.data.voltage * point.data.current,
        temperature: point.data.temperature || null,
        mode: point.data.mode || null,
        isOutput: point.data.isOutput || false
      };
    });

    groupedPoints.forEach((channelData, timestamp) => {
      applyChannelData(state, session, timestamp, channelData);
    });

    return state;
  });
}

/**
 * Get data for a specific time range
 * @param {number} startTime - Start timestamp
 * @param {number} endTime - End timestamp
 * @param {Array<number>} channels - Optional channel filter
 * @param {string} sessionId - Optional session ID
 * @returns {Array<{timestamp, data}>} Sorted array of data points
 */
function getDataRange(startTime: number, endTime: number, channels: number[] | null = null, sessionId: string | null = null): TimeRangePoint[] {
  const state = get(store);
  const targetSessionId = sessionId || state.activeSessionId;
  
  if (!targetSessionId || !state.sessions.has(targetSessionId)) {
    return [];
  }
  
  const session = state.sessions.get(targetSessionId);
  const result: TimeRangePoint[] = [];
  
  // Filter and sort timestamps
  const timestamps = Array.from(session.data.keys())
    .filter(ts => ts >= startTime && ts <= endTime)
    .sort((a, b) => a - b);
  
  // Build result array
  timestamps.forEach(timestamp => {
    const data = session.data.get(timestamp);
    const point = { timestamp, data: {} };
    
    // Filter by channels if specified
    if (channels) {
      channels.forEach(ch => {
        const key = `ch${ch}`;
        if (data[key]) {
          point.data[key] = data[key];
        }
      });
    } else {
      point.data = { ...data };
    }
    
    if (Object.keys(point.data).length > 0) {
      result.push(point);
    }
  });
  
  return result;
}

/**
 * Clean up old data based on max duration
 * @param {number} referenceTime - Optional reference time for testing
 */
function cleanupOldData(referenceTime: number | null = null): void {
  store.update(state => {
    const now = referenceTime || Date.now();
    
    state.sessions.forEach((session, sessionId) => {
      // Skip active session cleanup if it's still being recorded
      if (sessionId === state.activeSessionId && !session.endTime) {
        // For active sessions, still clean up old data points
        const cutoffTime = now - state.config.maxDuration;
        const timestamps = Array.from(session.data.keys()).filter(ts => ts < cutoffTime);
        
        timestamps.forEach(ts => {
          session.data.delete(ts);
          session.pointCount--;
        });
        
        // Update metadata if we removed old points
        if (timestamps.length > 0) {
          const remainingTimestamps = Array.from(session.data.keys());
          session.metadata.minTimestamp = remainingTimestamps.length > 0 
            ? Math.min(...remainingTimestamps) 
            : null;
        }
        return;
      }
      
      // Remove entire session if it's too old
      if (session.endTime && (now - session.endTime) > state.config.maxDuration) {
        state.sessions.delete(sessionId);
        if (state.activeSessionId === sessionId) {
          state.activeSessionId = null;
        }
        return;
      }
      
      // Clean up old data points within session
      const cutoffTime = now - state.config.maxDuration;
      const timestamps = Array.from(session.data.keys()).filter(ts => ts < cutoffTime);
      
      timestamps.forEach(ts => {
        session.data.delete(ts);
        session.pointCount--;
      });
      
      // Update metadata if we removed old points
      if (timestamps.length > 0) {
        const remainingTimestamps = Array.from(session.data.keys());
        session.metadata.minTimestamp = remainingTimestamps.length > 0 
          ? Math.min(...remainingTimestamps) 
          : null;
      }
    });
    
    return state;
  });
}

/**
 * Close a session
 * @param {string} sessionId - Session ID to close
 */
function closeSession(sessionId: string): void {
  store.update(state => {
    if (state.sessions.has(sessionId)) {
      const session = state.sessions.get(sessionId);
      session.endTime = Date.now();
      
      // If this was the active session, clear it
      if (state.activeSessionId === sessionId) {
        state.activeSessionId = null;
      }
    }
    return state;
  });
}

/**
 * Set the active session
 * @param {string} sessionId - Session ID to activate
 */
function setActiveSession(sessionId: string): void {
  store.update(state => {
    if (state.sessions.has(sessionId)) {
      state.activeSessionId = sessionId;
    }
    return state;
  });
}

/**
 * Update configuration
 * @param {Object} config - Configuration updates
 */
function updateConfig(config: Partial<TimeseriesConfig>): void {
  store.update(state => {
    Object.assign(state.config, config);
    return state;
  });
}

/**
 * Reset the entire store
 */
function reset(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  store.set(createInitialState());
}

/**
 * Start automatic cleanup if enabled
 */
function startAutoCleanup(): void {
  const state = get(store);
  if (state.config.autoCleanup && !cleanupTimer) {
    cleanupTimer = setInterval(cleanupOldData, CLEANUP_INTERVAL);
  }
}

/**
 * Stop automatic cleanup
 */
function stopAutoCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// Derived stores for convenience
const activeSession: Readable<Session | null> = derived(store, ($store: TimeseriesState) => {
  if ($store.activeSessionId && $store.sessions.has($store.activeSessionId)) {
    return $store.sessions.get($store.activeSessionId) || null;
  }
  return null;
});

const sessionList: Readable<Session[]> = derived(store, ($store: TimeseriesState) => {
  return Array.from($store.sessions.values())
    .sort((a, b) => b.startTime - a.startTime);
});

// Helper type to properly type the activeSessionData
type SessionDataEntry = { timestamp: number } & Record<string, ChannelDataPoint>;

const activeSessionData: Readable<SessionDataEntry[]> = derived(activeSession, ($session: Session | null) => {
  if (!$session) return [];
  
  return Array.from($session.data.entries())
    .map(([timestamp, data]) => ({ timestamp, ...data }))
    .sort((a, b) => a.timestamp - b.timestamp);
});

// Don't auto-start cleanup - let consumers decide
// startAutoCleanup();

// Export the store and functions
export const timeseriesStore: TimeseriesStore = {
  subscribe: store.subscribe,
  createSession,
  addDataPoint,
  addDataPoints,
  getDataRange,
  closeSession,
  setActiveSession,
  updateConfig,
  cleanupOldData,
  startAutoCleanup,
  stopAutoCleanup,
  reset,
  // Derived stores
  activeSession,
  sessionList,
  activeSessionData
};
