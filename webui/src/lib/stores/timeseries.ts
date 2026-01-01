import { derived, get, writable } from 'svelte/store';

/**
 * Centralized time-series data store for all channel data.
 * Stores data points with timestamp correlation across channels.
 */

// Type definitions
interface ChannelData {
  voltage: number;
  current: number;
  power: number;
  temperature: number | null;
  mode: string | null;
  isOutput: boolean;
}

type ChannelKey = `ch${number}`;
type ChannelDataByChannel = Partial<Record<ChannelKey, ChannelData>>;

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
  data: Map<number, ChannelDataByChannel>;
  pointCount: number;
  metadata: SessionMetadata;
}

interface TimeSeriesConfig {
  maxDuration: number;
  maxPoints: number;
  autoCleanup: boolean;
}

interface TimeSeriesState {
  sessions: Map<string, Session>;
  activeSessionId: string | null;
  config: TimeSeriesConfig;
}

export interface TimeSeriesPoint {
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

interface TimeSeriesDataPoint {
  timestamp: number;
  data: ChannelDataByChannel;
}

// Configuration constants
const DEFAULT_MAX_DURATION = 3600000; // 1 hour in milliseconds
const DEFAULT_MAX_POINTS = 100000; // Maximum data points per session
const CLEANUP_INTERVAL = 60000; // Cleanup old data every minute

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function createInitialState(): TimeSeriesState {
  return {
    sessions: new Map(),
    activeSessionId: null,
    config: {
      maxDuration: DEFAULT_MAX_DURATION,
      maxPoints: DEFAULT_MAX_POINTS,
      autoCleanup: true,
    },
  };
}

function applyChannelData(
  state: TimeSeriesState,
  session: Session,
  timestamp: number,
  channelData: ChannelDataByChannel
): void {
  if (session.pointCount >= state.config.maxPoints) return;

  if (!session.data.has(timestamp)) {
    session.data.set(timestamp, {});
    session.pointCount++;
  }

  const existingData = session.data.get(timestamp);
  if (existingData) {
    Object.assign(existingData, channelData);
  }

  if (!session.metadata.minTimestamp || timestamp < session.metadata.minTimestamp) {
    session.metadata.minTimestamp = timestamp;
  }
  if (!session.metadata.maxTimestamp || timestamp > session.metadata.maxTimestamp) {
    session.metadata.maxTimestamp = timestamp;
  }

  if (!session.metadata.sampleRate && session.data.size > 10) {
    const timestamps = Array.from(session.data.keys()).sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < Math.min(10, timestamps.length); i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    session.metadata.sampleRate = avgInterval > 0 ? 1000 / avgInterval : null;
  }
}

export function createTimeseriesStore() {
  const store = writable(createInitialState());
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  function createSession(channels: number[] = []): string {
    const sessionId = generateSessionId();
    const startTime = Date.now();

    store.update((state) => {
      state.sessions.set(sessionId, {
        id: sessionId,
        startTime,
        endTime: null,
        channels: new Set(channels),
        data: new Map(),
        pointCount: 0,
        metadata: {
          createdAt: new Date(startTime),
          sampleRate: null,
          minTimestamp: null,
          maxTimestamp: null,
        },
      });

      if (!state.activeSessionId) {
        state.activeSessionId = sessionId;
      }

      return state;
    });

    return sessionId;
  }

  function addDataPoint(
    channel: number,
    timestamp: number,
    data: TimeSeriesPoint['data'],
    sessionId: string | null = null
  ): void {
    store.update((state) => {
      const targetSessionId = sessionId || state.activeSessionId;
      if (!targetSessionId || !state.sessions.has(targetSessionId)) {
        return state;
      }

      const session = state.sessions.get(targetSessionId);
      if (!session) return state;

      applyChannelData(state, session, timestamp, {
        [`ch${channel}`]: {
          voltage: data.voltage,
          current: data.current,
          power: data.voltage * data.current,
          temperature: data.temperature || null,
          mode: data.mode || null,
          isOutput: data.isOutput || false,
        },
      });

      return state;
    });
  }

  function addDataPoints(points: TimeSeriesPoint[], sessionId: string | null = null): void {
    store.update((state) => {
      const targetSessionId = sessionId || state.activeSessionId;
      if (!targetSessionId || !state.sessions.has(targetSessionId)) {
        return state;
      }

      const session = state.sessions.get(targetSessionId);
      if (!session) return state;

      const groupedPoints = new Map<number, ChannelDataByChannel>();
      points.forEach((point) => {
        if (!groupedPoints.has(point.timestamp)) {
          groupedPoints.set(point.timestamp, {});
        }
        const pointData = groupedPoints.get(point.timestamp);
        if (pointData) {
          pointData[`ch${point.channel}`] = {
            voltage: point.data.voltage,
            current: point.data.current,
            power: point.data.voltage * point.data.current,
            temperature: point.data.temperature || null,
            mode: point.data.mode || null,
            isOutput: point.data.isOutput || false,
          };
        }
      });

      groupedPoints.forEach((channelData, timestamp) => {
        applyChannelData(state, session, timestamp, channelData);
      });

      return state;
    });
  }

  function getDataRange(
    startTime: number,
    endTime: number,
    channels: number[] | null = null,
    sessionId: string | null = null
  ): TimeSeriesDataPoint[] {
    const state = get(store);
    const targetSessionId = sessionId || state.activeSessionId;

    if (!targetSessionId || !state.sessions.has(targetSessionId)) return [];

    const session = state.sessions.get(targetSessionId);
    if (!session) return [];

    const result: TimeSeriesDataPoint[] = [];

    const timestamps = Array.from(session.data.keys())
      .filter((ts) => ts >= startTime && ts <= endTime)
      .sort((a, b) => a - b);

    timestamps.forEach((timestamp) => {
      const data = session.data.get(timestamp);
      if (!data) return;

      const point: TimeSeriesDataPoint = { timestamp, data: {} };

      if (channels) {
        channels.forEach((ch) => {
          const key = `ch${ch}` as ChannelKey;
          const channelData = data[key];
          if (channelData) {
            point.data[key] = channelData;
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

  function cleanupOldData(referenceTime: number | null = null): void {
    store.update((state) => {
      const now = referenceTime || Date.now();

      state.sessions.forEach((session, sessionId) => {
        const cutoffTime = now - state.config.maxDuration;

        if (sessionId === state.activeSessionId && !session.endTime) {
          const timestamps = Array.from(session.data.keys()).filter((ts) => ts < cutoffTime);

          timestamps.forEach((ts) => {
            session.data.delete(ts);
            session.pointCount--;
          });

          if (timestamps.length > 0) {
            const remainingTimestamps = Array.from(session.data.keys());
            session.metadata.minTimestamp = remainingTimestamps.length > 0 ? Math.min(...remainingTimestamps) : null;
          }
          return;
        }

        if (session.endTime && now - session.endTime > state.config.maxDuration) {
          state.sessions.delete(sessionId);
          if (state.activeSessionId === sessionId) {
            state.activeSessionId = null;
          }
          return;
        }

        const timestamps = Array.from(session.data.keys()).filter((ts) => ts < cutoffTime);

        timestamps.forEach((ts) => {
          session.data.delete(ts);
          session.pointCount--;
        });

        if (timestamps.length > 0) {
          const remainingTimestamps = Array.from(session.data.keys());
          session.metadata.minTimestamp = remainingTimestamps.length > 0 ? Math.min(...remainingTimestamps) : null;
        }
      });

      return state;
    });
  }

  function closeSession(sessionId: string): void {
    store.update((state) => {
      const session = state.sessions.get(sessionId);
      if (session) {
        session.endTime = Date.now();

        if (state.activeSessionId === sessionId) {
          state.activeSessionId = null;
        }
      }
      return state;
    });
  }

  function setActiveSession(sessionId: string): void {
    store.update((state) => {
      if (state.sessions.has(sessionId)) {
        state.activeSessionId = sessionId;
      }
      return state;
    });
  }

  function updateConfig(config: Partial<TimeSeriesConfig>): void {
    store.update((state) => {
      Object.assign(state.config, config);
      return state;
    });
  }

  function reset(): void {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
    store.set(createInitialState());
  }

  function startAutoCleanup(): void {
    const state = get(store);
    if (state.config.autoCleanup && !cleanupTimer) {
      cleanupTimer = setInterval(cleanupOldData, CLEANUP_INTERVAL);
    }
  }

  function stopAutoCleanup(): void {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }

  const activeSession = derived(store, ($store) => {
    if ($store.activeSessionId && $store.sessions.has($store.activeSessionId)) {
      return $store.sessions.get($store.activeSessionId) ?? null;
    }
    return null;
  });

  const sessionList = derived(store, ($store) => {
    return Array.from($store.sessions.values()).sort((a, b) => b.startTime - a.startTime);
  });

  const activeSessionData = derived(activeSession, ($session) => {
    if (!$session) return [];

    return Array.from($session.data.entries())
      .map(([timestamp, data]) => ({ timestamp, ...data }))
      .sort((a, b) => a.timestamp - b.timestamp);
  });

  return {
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
    activeSession,
    sessionList,
    activeSessionData,
  };
}

export type TimeseriesStore = ReturnType<typeof createTimeseriesStore>;

export const timeseriesStore = createTimeseriesStore();
