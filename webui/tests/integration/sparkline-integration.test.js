import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get, writable } from 'svelte/store';

// Mock Observable Plot
vi.mock('@observablehq/plot', () => {
  const mockPlot = vi.fn((options) => {
    const element = document.createElement('svg');
    element.setAttribute('width', options?.width || '200');
    element.setAttribute('height', options?.height || '60');
    element.setAttribute('class', 'plot-d6a7b5');
    element.innerHTML = '<g class="plot-marks"></g>';
    return element;
  });

  return {
    plot: mockPlot,
    lineY: vi.fn((data, options) => ({ type: 'lineY', data, options })),
    dot: vi.fn((data, options) => ({ type: 'dot', data, options })),
    ruleY: vi.fn((data, options) => ({ type: 'ruleY', data, options })),
    default: {
      plot: mockPlot,
      lineY: vi.fn((data, options) => ({ type: 'lineY', data, options })),
      dot: vi.fn((data, options) => ({ type: 'dot', data, options })),
      ruleY: vi.fn((data, options) => ({ type: 'ruleY', data, options })),
    },
  };
});

import Sparkline from '$lib/components/Sparkline.svelte';
import { createSparklineStore } from '$lib/stores/sparkline.js';

function createChannelStoreStub() {
  const initial = Array.from({ length: 6 }, (_, i) => ({
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
  }));

  const channels = writable(initial);

  return {
    channels,
    reset: () => channels.set(initial),
  };
}

describe('Sparkline Integration with Channel Store', () => {
  let channelStore;
  let sparklineStore;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    channelStore = createChannelStoreStub();
    sparklineStore = createSparklineStore({ channels: channelStore.channels });
    sparklineStore.clear();
  });

  afterEach(() => {
    sparklineStore.destroy();
    vi.useRealTimers();
  });

  it('updates sparkline data when channel measurements change', async () => {
    const Plot = await import('@observablehq/plot');

    render(Sparkline, {
      props: {
        channel: 0,
        metric: 'voltage',
        width: 200,
        height: 60,
        sparklineStore,
      },
    });

    channelStore.channels.update((channels) => {
      channels[0] = {
        ...channels[0],
        online: true,
        voltage: 3.3,
        current: 0.5,
        temperature: 25.0,
        machineType: 'P906',
        isOutput: false,
      };
      return channels;
    });

    await tick();
    vi.advanceTimersByTime(100);
    await tick();

    const sparklineData = get(sparklineStore.data);
    expect(sparklineData[0]?.voltage?.length).toBeGreaterThan(0);

    const latest = sparklineData[0].voltage[sparklineData[0].voltage.length - 1];
    expect(latest.value).toBe(3.3);

    await waitFor(() => {
      expect(Plot.plot).toHaveBeenCalled();
    });
  });

  it('handles multiple updates over time', async () => {
    render(Sparkline, {
      props: {
        channel: 0,
        metric: 'current',
        width: 200,
        height: 60,
        sparklineStore,
      },
    });

    const updates = [
      { voltage: 3.3, current: 0.5 },
      { voltage: 3.4, current: 0.6 },
      { voltage: 3.2, current: 0.4 },
    ];

    for (const update of updates) {
      channelStore.channels.update((channels) => {
        channels[0] = {
          ...channels[0],
          online: true,
          voltage: update.voltage,
          current: update.current,
          temperature: 25.0,
          machineType: 'P906',
        };
        return channels;
      });

      vi.advanceTimersByTime(1000);
      await tick();
    }

    const sparklineData = get(sparklineStore.data);
    expect(sparklineData[0]?.current?.length).toBe(3);
    expect(sparklineData[0].current.map((p) => p.value)).toEqual([0.5, 0.6, 0.4]);
  });

  it('calculates power metric from voltage and current', async () => {
    render(Sparkline, {
      props: {
        channel: 1,
        metric: 'power',
        width: 200,
        height: 60,
        sparklineStore,
      },
    });

    channelStore.channels.update((channels) => {
      channels[1] = {
        ...channels[1],
        online: true,
        voltage: 5.0,
        current: 1.2,
        temperature: 30.0,
        machineType: 'P906',
      };
      return channels;
    });

    await tick();
    vi.advanceTimersByTime(100);
    await tick();

    const sparklineData = get(sparklineStore.data);
    expect(sparklineData[1]?.power?.length).toBeGreaterThan(0);

    const latest = sparklineData[1].power[sparklineData[1].power.length - 1];
    expect(latest.value).toBe(6.0);
  });

  it('maintains a 1-minute sliding window', async () => {
    render(Sparkline, {
      props: {
        channel: 0,
        metric: 'voltage',
        width: 200,
        height: 60,
        sparklineStore,
      },
    });

    const startTime = 1000000;
    vi.setSystemTime(startTime);

    for (let i = 0; i < 10; i++) {
      vi.setSystemTime(startTime + i * 10000);

      channelStore.channels.update((channels) => {
        channels[0] = {
          ...channels[0],
          online: true,
          voltage: 3.0 + i * 0.1,
          current: 0.5,
          temperature: 25.0,
          machineType: 'P906',
        };
        return channels;
      });

      await tick();
    }

    vi.setSystemTime(startTime + 75000);
    vi.advanceTimersByTime(6000);
    await tick();

    const sparklineData = get(sparklineStore.data);
    const voltageData = sparklineData[0]?.voltage || [];
    const oneMinuteAgo = Date.now() - 60000;

    voltageData.forEach((point) => {
      expect(point.timestamp).toBeGreaterThanOrEqual(oneMinuteAgo);
    });
    expect(voltageData.length).toBeLessThan(10);
  });

  it('does not add data for offline channels', async () => {
    render(Sparkline, {
      props: {
        channel: 0,
        metric: 'voltage',
        width: 200,
        height: 60,
        sparklineStore,
      },
    });

    channelStore.channels.update((channels) => {
      channels[0] = {
        ...channels[0],
        online: false,
        voltage: 3.3,
        current: 0.5,
        temperature: 25.0,
        machineType: 'Unknown',
      };
      return channels;
    });

    await tick();
    vi.advanceTimersByTime(100);
    await tick();

    const sparklineData = get(sparklineStore.data);
    expect(sparklineData[0]).toBeUndefined();
  });

  it('handles target value changes in channel store', async () => {
    channelStore.channels.update((channels) => {
      channels[0] = {
        ...channels[0],
        online: true,
        voltage: 3.2,
        current: 0.5,
        targetVoltage: 3.3,
        targetCurrent: 0.6,
        targetPower: 1.98,
        temperature: 25.0,
        machineType: 'P906',
      };
      return channels;
    });

    await tick();
    vi.advanceTimersByTime(100);
    await tick();

    const channels = get(channelStore.channels);
    expect(channels[0].targetVoltage).toBe(3.3);
    expect(channels[0].targetCurrent).toBe(0.6);
    expect(channels[0].targetPower).toBe(1.98);

    const sparklineData = get(sparklineStore.data);
    expect(sparklineData[0]?.voltage).toBeDefined();
    expect(sparklineData[0]?.current).toBeDefined();
    expect(sparklineData[0]?.power).toBeDefined();
  });
});
