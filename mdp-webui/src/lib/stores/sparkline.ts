import { derived, writable } from 'svelte/store';
import type { Readable, Writable } from 'svelte/store';
import type { Channel } from '../types';
import type { SparklineDataPoint } from '../types';

interface MetricData {
  [metric: string]: SparklineDataPoint[];
}

interface SparklineData {
  [channel: number]: MetricData;
}

const WINDOW_DURATION_MS = 60 * 1000; // 1 minute
const CLEANUP_INTERVAL_MS = 5 * 1000; // Clean up every 5 seconds

export type SparklineStore = ReturnType<typeof createSparklineStore>;

export function createSparklineStore(options: { channels: Readable<Channel[]> }): {
  data: Readable<SparklineData>;
  addDataPoint: (channel: number, metric: string, value: number, timestamp?: number) => void;
  getChannelMetricData: (channel: number, metric: string) => Readable<SparklineDataPoint[]>;
  clear: () => void;
  destroy: () => void;
} {
  const sparklineData: Writable<SparklineData> = writable({});

  let cleanupInterval: ReturnType<typeof setInterval> | null = null;

  function startCleanup(): void {
    if (cleanupInterval) return;

    cleanupInterval = setInterval(() => {
      const now = Date.now();
      const cutoffTime = now - WINDOW_DURATION_MS;

      sparklineData.update((data) => {
        const newData: SparklineData = {};

        Object.keys(data).forEach((channelKey) => {
          const channel = Number(channelKey);
          newData[channel] = {};

          Object.keys(data[channel]).forEach((metric) => {
            newData[channel][metric] = data[channel][metric].filter((point) => point.timestamp >= cutoffTime);
          });
        });

        return newData;
      });
    }, CLEANUP_INTERVAL_MS);
  }

  function stopCleanup(): void {
    if (!cleanupInterval) return;
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  function addDataPoint(channel: number, metric: string, value: number, timestamp: number = Date.now()): void {
    sparklineData.update((data) => {
      if (!data[channel]) {
        data[channel] = {};
      }
      if (!data[channel][metric]) {
        data[channel][metric] = [];
      }

      data[channel][metric].push({ timestamp, value });

      const cutoffTime = timestamp - WINDOW_DURATION_MS;
      data[channel][metric] = data[channel][metric].filter((point) => point.timestamp >= cutoffTime);

      return data;
    });
  }

  function getChannelMetricData(channel: number, metric: string): Readable<SparklineDataPoint[]> {
    return derived(sparklineData, ($data) => {
      if (!$data[channel] || !$data[channel][metric]) return [];
      return $data[channel][metric];
    });
  }

  function clear(): void {
    sparklineData.set({});
  }

  function subscribeToChannelUpdates(): () => void {
    return options.channels.subscribe(($channels) => {
      const now = Date.now();
      $channels.forEach((channel) => {
        if (!channel.online) return;
        addDataPoint(channel.channel, 'voltage', channel.voltage, now);
        addDataPoint(channel.channel, 'current', channel.current, now);
        addDataPoint(channel.channel, 'power', channel.voltage * channel.current, now);
      });
    });
  }

  startCleanup();
  const unsubscribeChannels = subscribeToChannelUpdates();

  return {
    data: derived(sparklineData, ($data) => $data),
    addDataPoint,
    getChannelMetricData,
    clear,
    destroy: () => {
      stopCleanup();
      unsubscribeChannels();
    },
  };
}
