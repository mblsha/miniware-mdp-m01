import { writable, derived, get } from 'svelte/store';

/**
 * Centralized time-series data store for all channel data
 * Stores data points with timestamp correlation across channels
 */

// Configuration constants
const DEFAULT_MAX_DURATION = 3600000; // 1 hour in milliseconds
const DEFAULT_MAX_POINTS = 100000;   // Maximum data points per session
const CLEANUP_INTERVAL = 60000;      // Cleanup old data every minute

// Helper to generate unique session IDs
function generateSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Initialize the store state
function createInitialState() {
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
const store = writable(createInitialState());

// Keep track of cleanup interval
let cleanupTimer = null;

/**
 * Create a new recording session
 * @param {Array<number>} channels - Array of channel numbers to record
 * @returns {string} The new session ID
 */
function createSession(channels = []) {
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
function addDataPoint(channel, timestamp, data, sessionId = null) {
  store.update(state => {
    const targetSessionId = sessionId || state.activeSessionId;
    if (!targetSessionId || !state.sessions.has(targetSessionId)) {
      return state;
    }
    
    const session = state.sessions.get(targetSessionId);
    
    // Check if we've exceeded limits
    if (session.pointCount >= state.config.maxPoints) {
      console.warn(`Session ${targetSessionId} has reached max points limit`);
      return state;
    }
    
    // Get or create timestamp entry
    if (!session.data.has(timestamp)) {
      session.data.set(timestamp, {});
      session.pointCount++;
    }
    
    // Add channel data
    const timestampData = session.data.get(timestamp);
    timestampData[`ch${channel}`] = {
      voltage: data.voltage,
      current: data.current,
      power: data.voltage * data.current,
      temperature: data.temperature || null,
      mode: data.mode || null,
      isOutput: data.isOutput || false
    };
    
    // Update metadata
    if (!session.metadata.minTimestamp || timestamp < session.metadata.minTimestamp) {
      session.metadata.minTimestamp = timestamp;
    }
    if (!session.metadata.maxTimestamp || timestamp > session.metadata.maxTimestamp) {
      session.metadata.maxTimestamp = timestamp;
    }
    
    // Calculate sample rate from first few samples
    if (!session.metadata.sampleRate && session.data.size > 10) {
      const timestamps = Array.from(session.data.keys()).sort((a, b) => a - b);
      const intervals = [];
      for (let i = 1; i < Math.min(10, timestamps.length); i++) {
        intervals.push(timestamps[i] - timestamps[i-1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      session.metadata.sampleRate = avgInterval > 0 ? 1000 / avgInterval : null;
    }
    
    return state;
  });
}

/**
 * Add multiple data points in batch
 * @param {Array<{channel, timestamp, data}>} points - Array of data points
 * @param {string} sessionId - Optional session ID
 */
function addDataPoints(points, sessionId = null) {
  store.update(state => {
    const targetSessionId = sessionId || state.activeSessionId;
    if (!targetSessionId || !state.sessions.has(targetSessionId)) {
      return state;
    }
    
    const session = state.sessions.get(targetSessionId);
    
    // Group points by timestamp for efficiency
    const groupedPoints = new Map();
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
    
    // Add all grouped points
    groupedPoints.forEach((channelData, timestamp) => {
      if (session.pointCount >= state.config.maxPoints) {
        return;
      }
      
      if (!session.data.has(timestamp)) {
        session.data.set(timestamp, {});
        session.pointCount++;
      }
      
      Object.assign(session.data.get(timestamp), channelData);
      
      // Update metadata
      if (!session.metadata.minTimestamp || timestamp < session.metadata.minTimestamp) {
        session.metadata.minTimestamp = timestamp;
      }
      if (!session.metadata.maxTimestamp || timestamp > session.metadata.maxTimestamp) {
        session.metadata.maxTimestamp = timestamp;
      }
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
function getDataRange(startTime, endTime, channels = null, sessionId = null) {
  const state = get(store);
  const targetSessionId = sessionId || state.activeSessionId;
  
  if (!targetSessionId || !state.sessions.has(targetSessionId)) {
    return [];
  }
  
  const session = state.sessions.get(targetSessionId);
  const result = [];
  
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
function cleanupOldData(referenceTime = null) {
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
function closeSession(sessionId) {
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
function setActiveSession(sessionId) {
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
function updateConfig(config) {
  store.update(state => {
    Object.assign(state.config, config);
    return state;
  });
}

/**
 * Reset the entire store
 */
function reset() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  store.set(createInitialState());
}

/**
 * Start automatic cleanup if enabled
 */
function startAutoCleanup() {
  const state = get(store);
  if (state.config.autoCleanup && !cleanupTimer) {
    cleanupTimer = setInterval(cleanupOldData, CLEANUP_INTERVAL);
  }
}

/**
 * Stop automatic cleanup
 */
function stopAutoCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// Derived stores for convenience
const activeSession = derived(store, $store => {
  if ($store.activeSessionId && $store.sessions.has($store.activeSessionId)) {
    return $store.sessions.get($store.activeSessionId);
  }
  return null;
});

const sessionList = derived(store, $store => {
  return Array.from($store.sessions.values())
    .sort((a, b) => b.startTime - a.startTime);
});

const activeSessionData = derived(activeSession, $session => {
  if (!$session) return [];
  
  return Array.from($session.data.entries())
    .map(([timestamp, data]) => ({ timestamp, ...data }))
    .sort((a, b) => a.timestamp - b.timestamp);
});

// Don't auto-start cleanup - let consumers decide
// startAutoCleanup();

// Export the store and functions
export const timeseriesStore = {
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