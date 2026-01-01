import { describe, it, expect, beforeEach } from 'vitest';
import { get, writable } from 'svelte/store';
import { createSignal } from '$lib/core/signal.js';
import { createTimeseriesStore } from '$lib/stores/timeseries.js';
import { createTimeseriesIntegration } from '$lib/stores/timeseries-integration.js';

function createPacketBus() {
  return {
    start: () => {},
    stop: () => {},
    onRawPacket: createSignal(),
    onDecodedPacket: createSignal(),
    onSynthesize: createSignal(),
    onWave: createSignal(),
    onAddress: createSignal(),
    onMachine: createSignal(),
    onUpdateChannel: createSignal(),
  };
}

function createChannelStoreStub() {
  const channels = writable(
    Array.from({ length: 6 }, (_, i) => ({
      channel: i,
      online: false,
      machineType: 'Unknown',
      voltage: 0,
      current: 0,
      power: 0,
      temperature: 0,
      isOutput: false,
      mode: 'Normal',
      address: [0, 0, 0, 0, 0],
      targetVoltage: 0,
      targetCurrent: 0,
      targetPower: 0,
      recording: false,
      waveformData: [],
    }))
  );

  return {
    channels,
    startRecording: (channel) => {
      channels.update((chs) => {
        const next = [...chs];
        next[channel] = { ...next[channel], recording: true, waveformData: [] };
        return next;
      });
    },
    stopRecording: (channel) => {
      channels.update((chs) => {
        const next = [...chs];
        next[channel] = { ...next[channel], recording: false };
        return next;
      });
    },
  };
}

describe('TimeseriesIntegration', () => {
  let packets;
  let timeseries;
  let channels;
  let integration;

  beforeEach(() => {
    packets = createPacketBus();
    timeseries = createTimeseriesStore();
    channels = createChannelStoreStub();
    integration = createTimeseriesIntegration({ packets, timeseries, channels });
  });

  describe('Packet Bus Integration', () => {
    it('processes synthesize packets when session is active', () => {
      integration.startRecording([0, 1, 2]);

      packets.onSynthesize.emit({
        packType: 0x11,
        size: 0,
        data: {
          channels: [
            { outVoltage: 3.3, outCurrent: 0.5, temperature: 25.5, outputOn: 1, type: 2, statusPsu: 2, statusLoad: 0 },
            { outVoltage: 5.0, outCurrent: 1.0, temperature: 26.0, outputOn: 1, type: 2, statusPsu: 1, statusLoad: 0 },
            { outVoltage: 12.0, outCurrent: 0.25, temperature: 24.0, outputOn: 0, type: 3, statusLoad: 0, statusPsu: 0 },
          ],
        },
      });

      const sessionData = get(timeseries.activeSessionData);
      expect(sessionData).toHaveLength(1);
      expect(sessionData[0]).toMatchObject({
        ch0: { voltage: 3.3, current: 0.5, temperature: 25.5, isOutput: true },
        ch1: { voltage: 5.0, current: 1.0, temperature: 26.0, isOutput: true },
        ch2: { voltage: 12.0, current: 0.25, temperature: 24.0, isOutput: false },
      });
    });

    it('processes wave packets for active channels', () => {
      integration.startRecording([0]);

      packets.onWave.emit({
        packType: 0x12,
        size: 0,
        data: {
          channel: 0,
          groups: [
            {
              timestamp: 1000,
              items: [
                { voltage: 3.3, current: 0.5 },
                { voltage: 3.31, current: 0.51 },
              ],
            },
            {
              timestamp: 1020,
              items: [
                { voltage: 3.32, current: 0.52 },
                { voltage: 3.33, current: 0.53 },
              ],
            },
          ],
        },
      });

      const sessionData = get(timeseries.activeSessionData);
      expect(sessionData).toHaveLength(4);
      expect(sessionData[0]).toMatchObject({ timestamp: 1000, ch0: { voltage: 3.3, current: 0.5 } });
      expect(sessionData[1]).toMatchObject({ timestamp: 1010, ch0: { voltage: 3.31, current: 0.51 } });
      expect(sessionData[2]).toMatchObject({ timestamp: 1020, ch0: { voltage: 3.32, current: 0.52 } });
      expect(sessionData[3]).toMatchObject({ timestamp: 1030, ch0: { voltage: 3.33, current: 0.53 } });
    });

    it('ignores packets when no active session', () => {
      packets.onSynthesize.emit({
        packType: 0x11,
        size: 0,
        data: { channels: [{ outVoltage: 3.3, outCurrent: 0.5, temperature: 25.5, outputOn: 1, type: 2, statusPsu: 2, statusLoad: 0 }] },
      });

      const sessions = get(timeseries.sessionList);
      expect(sessions).toHaveLength(0);
    });
  });

  describe('Recording Control', () => {
    it('starts recording with specified channels', () => {
      const sessionId = integration.startRecording([0, 2, 4]);

      expect(sessionId).toBeTruthy();
      const activeSession = get(timeseries.activeSession);
      expect(activeSession.channels).toEqual(new Set([0, 2, 4]));

      const channelData = get(channels.channels);
      expect(channelData[0].recording).toBe(true);
      expect(channelData[1].recording).toBe(false);
      expect(channelData[2].recording).toBe(true);
      expect(channelData[4].recording).toBe(true);
    });

    it('stops recording and closes session', () => {
      integration.startRecording([0, 1]);
      integration.stopRecording();

      expect(get(timeseries.activeSession)).toBeNull();

      const channelData = get(channels.channels);
      channelData.forEach((ch) => expect(ch.recording).toBe(false));

      const sessions = get(timeseries.sessionList);
      expect(sessions[0].endTime).toBeTruthy();
    });
  });

  describe('Data Export', () => {
    it('exports active session data to CSV', () => {
      integration.startRecording([0, 1]);
      const baseTime = Date.now();

      timeseries.addDataPoints([
        { channel: 0, timestamp: baseTime, data: { voltage: 3.3, current: 0.5 } },
        { channel: 1, timestamp: baseTime, data: { voltage: 5.0, current: 1.0 } },
        { channel: 0, timestamp: baseTime + 100, data: { voltage: 3.31, current: 0.51 } },
        { channel: 1, timestamp: baseTime + 100, data: { voltage: 5.01, current: 1.01 } },
      ]);

      const csv = integration.exportSessionToCSV();
      const lines = csv.split('\n');

      expect(lines[0]).toBe(
        'Timestamp (ms),Time (s),Ch0 Voltage (V),Ch0 Current (A),Ch0 Power (W),Ch1 Voltage (V),Ch1 Current (A),Ch1 Power (W)'
      );
      expect(lines[1]).toContain('0.000');
      expect(lines[2]).toContain('0.100');
      expect(lines[1]).toContain('3.300,0.500,1.650,5.000,1.000,5.000');
    });

    it('exports specific channels only', () => {
      const sessionId = integration.startRecording([0, 1, 2]);
      const baseTime = Date.now();

      timeseries.addDataPoint(0, baseTime, { voltage: 3.3, current: 0.5 });
      timeseries.addDataPoint(1, baseTime, { voltage: 5.0, current: 1.0 });
      timeseries.addDataPoint(2, baseTime, { voltage: 12.0, current: 0.25 });

      const csv = integration.exportSessionToCSV(sessionId, [0, 2]);
      const lines = csv.split('\n');

      expect(lines[0]).toBe(
        'Timestamp (ms),Time (s),Ch0 Voltage (V),Ch0 Current (A),Ch0 Power (W),Ch2 Voltage (V),Ch2 Current (A),Ch2 Power (W)'
      );
      expect(lines[1]).not.toContain('5.000');
    });
  });

  describe('Chart Data Retrieval', () => {
    it('gets chart data for active session', () => {
      integration.startRecording([0]);
      const now = Date.now();
      const baseTime = now - 1000;

      for (let i = 0; i < 10; i++) {
        timeseries.addDataPoint(0, baseTime + i * 50, { voltage: 3.3 + i * 0.1, current: 0.5 + i * 0.01 });
      }

      const chartData = integration.getChartData(0, 2000);
      expect(chartData.timestamps).toHaveLength(10);
      expect(chartData.voltage[0]).toBe(3.3);
      expect(chartData.voltage[9]).toBe(4.2);
      expect(chartData.power[0]).toBeCloseTo(1.65, 2);
    });

    it('returns empty data for inactive channel', () => {
      integration.startRecording([0]);
      const chartData = integration.getChartData(1);

      expect(chartData.timestamps).toHaveLength(0);
      expect(chartData.voltage).toHaveLength(0);
    });
  });

  describe('Session Statistics', () => {
    it('calculates session statistics', () => {
      integration.startRecording([0, 1]);
      const baseTime = Date.now();

      for (let i = 0; i < 10; i++) {
        timeseries.addDataPoint(0, baseTime + i * 100, { voltage: 3.0 + i * 0.1, current: 0.5 - i * 0.01 });
        timeseries.addDataPoint(1, baseTime + i * 100, { voltage: 5.0, current: 1.0 + i * 0.02 });
      }

      const stats = integration.getSessionStats();

      expect(stats).toBeTruthy();
      expect(stats.channels).toEqual([0, 1]);
      expect(stats.pointCount).toBe(10);

      expect(stats.channelStats[0].voltage.min).toBe(3.0);
      expect(stats.channelStats[0].voltage.max).toBe(3.9);
      expect(stats.channelStats[0].voltage.avg).toBeCloseTo(3.45, 2);
      expect(stats.channelStats[0].current.min).toBeCloseTo(0.41, 2);
      expect(stats.channelStats[0].current.max).toBe(0.5);

      expect(stats.channelStats[1].voltage.min).toBe(5.0);
      expect(stats.channelStats[1].voltage.max).toBe(5.0);
      expect(stats.channelStats[1].current.min).toBe(1.0);
      expect(stats.channelStats[1].current.max).toBe(1.18);
    });

    it('handles empty session stats', () => {
      const stats = integration.getSessionStats();
      expect(stats).toBeNull();
    });
  });
});
