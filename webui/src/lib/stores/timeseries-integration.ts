/**
 * Integration module for timeseries store with packet bus.
 * Connects decoded packets to timeseries recording and export utilities.
 */

import { get } from 'svelte/store';
import type { SynthesizeChannel } from '../types/kaitai';
import type { PacketBus } from '../services/packet-bus';
import type { ChannelStore } from './channels';
import type { TimeseriesStore, TimeSeriesPoint } from './timeseries';

function getOperatingMode(channel: SynthesizeChannel): string {
  // L1060
  if (channel.type === 3) {
    switch (channel.statusLoad) {
      case 0:
        return 'CC';
      case 1:
        return 'CV';
      case 2:
        return 'CR';
      case 3:
        return 'CP';
      default:
        return 'Normal';
    }
  }

  // P906
  if (channel.type === 2) {
    switch (channel.statusPsu) {
      case 1:
        return 'CC';
      case 2:
        return 'CV';
      default:
        return 'Normal';
    }
  }

  return 'Normal';
}

type MetricStats = { min: number; max: number; avg: number };
type ChannelStats = { voltage: MetricStats; current: MetricStats; power: MetricStats; sampleCount: number };
export type SessionStats = {
  sessionId: string;
  startTime: number;
  endTime: number | null;
  duration: number;
  channels: number[];
  pointCount: number;
  sampleRate: number | null;
  channelStats: Record<number, ChannelStats>;
};

export type TimeseriesIntegration = ReturnType<typeof createTimeseriesIntegration>;

export function createTimeseriesIntegration(options: {
  packets: PacketBus;
  timeseries: TimeseriesStore;
  channels: ChannelStore;
}): {
  startRecording: (channels: number[]) => string;
  stopRecording: () => void;
  exportSessionToCSV: (sessionId?: string | null, channels?: number[] | null) => string;
  getChartData: (
    channel: number,
    duration?: number
  ) => { timestamps: number[]; voltage: number[]; current: number[]; power: number[] };
  getSessionStats: (sessionId?: string | null) => SessionStats | null;
  destroy: () => void;
} {
  const { packets, timeseries, channels } = options;

  const unsubscribes = [
    packets.onSynthesize.subscribe((packet) => {
      const activeSession = get(timeseries.activeSession);
      if (!activeSession) return;

      const timestamp = Date.now();
      const points: TimeSeriesPoint[] = [];

      packet.data.channels.forEach((channelData, index: number) => {
        if (!activeSession.channels.has(index)) return;
        points.push({
          channel: index,
          timestamp,
          data: {
            voltage: channelData.outVoltage,
            current: channelData.outCurrent,
            temperature: channelData.temperature,
            mode: getOperatingMode(channelData),
            isOutput: channelData.outputOn !== 0,
          },
        });
      });

      if (points.length > 0) {
        timeseries.addDataPoints(points);
      }
    }),

    packets.onWave.subscribe((packet) => {
      const activeSession = get(timeseries.activeSession);
      if (!activeSession) return;

      const channel = packet.data.channel;
      if (!activeSession.channels.has(channel)) return;

      const points: TimeSeriesPoint[] = [];

      packet.data.groups.forEach((group) => {
        group.items.forEach((item, index: number) => {
          points.push({
            channel,
            timestamp: group.timestamp + index * 10,
            data: {
              voltage: item.voltage,
              current: item.current,
            },
          });
        });
      });

      if (points.length > 0) {
        timeseries.addDataPoints(points);
      }
    }),
  ];

  function startRecording(channelList: number[]): string {
    const sessionId = timeseries.createSession(channelList);
    channelList.forEach((channel) => {
      channels.startRecording(channel);
    });
    return sessionId;
  }

  function stopRecording(): void {
    const activeSession = get(timeseries.activeSession);
    if (!activeSession) return;

    const channelData = get(channels.channels);
    channelData.forEach((ch, index) => {
      if (ch.recording) {
        channels.stopRecording(index);
      }
    });

    timeseries.closeSession(activeSession.id);
  }

  function exportSessionToCSV(sessionId: string | null = null, channelsToExport: number[] | null = null): string {
    const targetSessionId = sessionId || get(timeseries.activeSession)?.id;
    if (!targetSessionId) return '';

    const sessions = get(timeseries.sessionList);
    const session = sessions.find((s) => s.id === targetSessionId);
    if (!session) return '';

    const data = timeseries.getDataRange(
      session.metadata.minTimestamp || session.startTime,
      session.metadata.maxTimestamp || Date.now(),
      channelsToExport,
      targetSessionId
    );

    if (data.length === 0) return '';

    const channelsForHeader = channelsToExport || Array.from(session.channels);
    const headers = ['Timestamp (ms)', 'Time (s)'];
    channelsForHeader.forEach((ch) => {
      headers.push(`Ch${ch} Voltage (V)`, `Ch${ch} Current (A)`, `Ch${ch} Power (W)`);
    });

    const rows = [headers.join(',')];
    const startTime = data[0].timestamp;

    data.forEach((point) => {
      const row: Array<string | number> = [point.timestamp, ((point.timestamp - startTime) / 1000).toFixed(3)];

      channelsForHeader.forEach((ch) => {
        const chData = point.data[`ch${ch}`];
        if (chData) {
          row.push(chData.voltage?.toFixed(3) || '', chData.current?.toFixed(3) || '', chData.power?.toFixed(3) || '');
        } else {
          row.push('', '', '');
        }
      });

      rows.push(row.join(','));
    });

    return rows.join('\n');
  }

  function getChartData(
    channel: number,
    duration: number = 10000
  ): { timestamps: number[]; voltage: number[]; current: number[]; power: number[] } {
    const activeSession = get(timeseries.activeSession);
    if (!activeSession || !activeSession.channels.has(channel)) {
      return { timestamps: [], voltage: [], current: [], power: [] };
    }

    const endTime = Date.now();
    const startTime = endTime - duration;
    const data = timeseries.getDataRange(startTime, endTime, [channel]);

    const result = {
      timestamps: [] as number[],
      voltage: [] as number[],
      current: [] as number[],
      power: [] as number[],
    };

    data.forEach((point) => {
      const chData = point.data[`ch${channel}`];
      if (!chData) return;
      result.timestamps.push(point.timestamp);
      result.voltage.push(chData.voltage || 0);
      result.current.push(chData.current || 0);
      result.power.push(chData.power || 0);
    });

    return result;
  }

  function getSessionStats(sessionId: string | null = null): SessionStats | null {
    const targetSessionId = sessionId || get(timeseries.activeSession)?.id;
    if (!targetSessionId) return null;

    const sessions = get(timeseries.sessionList);
    const session = sessions.find((s) => s.id === targetSessionId);
    if (!session) return null;

    const stats: SessionStats = {
      sessionId: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: (session.endTime || Date.now()) - session.startTime,
      channels: Array.from(session.channels),
      pointCount: session.pointCount,
      sampleRate: session.metadata.sampleRate,
      channelStats: {},
    };

    const data = timeseries.getDataRange(
      session.metadata.minTimestamp || session.startTime,
      session.metadata.maxTimestamp || Date.now(),
      null,
      targetSessionId
    );

    stats.channels.forEach((ch) => {
      stats.channelStats[ch] = {
        voltage: { min: Infinity, max: -Infinity, avg: 0 },
        current: { min: Infinity, max: -Infinity, avg: 0 },
        power: { min: Infinity, max: -Infinity, avg: 0 },
        sampleCount: 0,
      };
    });

    data.forEach((point) => {
      stats.channels.forEach((ch) => {
        const chData = point.data[`ch${ch}`];
        if (!chData) return;
        const chStats = stats.channelStats[ch];

        chStats.voltage.min = Math.min(chStats.voltage.min, chData.voltage);
        chStats.voltage.max = Math.max(chStats.voltage.max, chData.voltage);
        chStats.voltage.avg += chData.voltage;

        chStats.current.min = Math.min(chStats.current.min, chData.current);
        chStats.current.max = Math.max(chStats.current.max, chData.current);
        chStats.current.avg += chData.current;

        chStats.power.min = Math.min(chStats.power.min, chData.power);
        chStats.power.max = Math.max(chStats.power.max, chData.power);
        chStats.power.avg += chData.power;

        chStats.sampleCount++;
      });
    });

    stats.channels.forEach((ch) => {
      const chStats = stats.channelStats[ch];
      if (chStats.sampleCount > 0) {
        chStats.voltage.avg /= chStats.sampleCount;
        chStats.current.avg /= chStats.sampleCount;
        chStats.power.avg /= chStats.sampleCount;
      }
    });

    return stats;
  }

  function destroy(): void {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  return {
    startRecording,
    stopRecording,
    exportSessionToCSV,
    getChartData,
    getSessionStats,
    destroy,
  };
}
