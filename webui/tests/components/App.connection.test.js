import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';

// Mock Dashboard and ChannelDetail components
vi.mock('$lib/components/Dashboard.svelte', async () => {
  const MockDashboard = await import('../mocks/components/MockDashboard.svelte');
  return { default: MockDashboard.default };
});

vi.mock('$lib/components/ChannelDetail.svelte', async () => {
  const MockChannelDetail = await import('../mocks/components/MockChannelDetail.svelte');
  return { default: MockChannelDetail.default };
});

import App from '../../src/App.svelte';

function createRuntimeStub() {
  const status = writable('disconnected');
  const error = writable(null);
  const deviceType = writable(null);

  const serial = {
    status,
    error,
    deviceType,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

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
      mode: 'CV',
      recording: false,
      waveformData: [],
    }))
  );

  const channelStore = {
    channels,
    activeChannel: writable(0),
    reset: vi.fn(),
    setActiveChannel: vi.fn(),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    setVoltage: vi.fn(),
    setCurrent: vi.fn(),
    setOutput: vi.fn(),
  };

  return {
    serial,
    channels: channelStore,
    packets: {},
    sparklines: {},
    timeseries: {},
    timeseriesIntegration: {},
    destroy: vi.fn(),
  };
}

describe('App Connection Management Tests', () => {
  let runtime;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = createRuntimeStub();
    runtime.serial.status.set('disconnected');
    runtime.serial.error.set(null);
    runtime.serial.deviceType.set(null);
  });

  describe('Connection States', () => {
    it('shows connect button when disconnected', () => {
      const { getByText } = render(App, { props: { runtime } });
      expect(getByText('Connect')).toBeInTheDocument();
    });

    it('shows connecting state', async () => {
      const { getByText } = render(App, { props: { runtime } });

      runtime.serial.connect.mockImplementation(() => {
        runtime.serial.status.set('connecting');
        return new Promise(() => {});
      });

      await fireEvent.pointerDown(getByText('Connect'));
      await fireEvent.pointerUp(getByText('Connect'));

      await waitFor(() => {
        expect(getByText('Connecting...')).toBeInTheDocument();
      });
    });

    it('shows connected state with disconnect button', async () => {
      const { getByText } = render(App, { props: { runtime } });

      runtime.serial.connect.mockImplementation(async () => {
        runtime.serial.status.set('connecting');
        await new Promise((resolve) => setTimeout(resolve, 10));
        runtime.serial.status.set('connected');
      });

      await fireEvent.pointerDown(getByText('Connect'));
      await fireEvent.pointerUp(getByText('Connect'));

      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
        expect(getByText('Disconnect')).toBeInTheDocument();
      });
    });

    it('shows device type when available', async () => {
      runtime.serial.status.set('connected');
      runtime.serial.deviceType.set({ type: 'M01' });

      const { getByText } = render(App, { props: { runtime } });
      expect(getByText('(M01)')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('shows error state with retry button', async () => {
      const { getByText } = render(App, { props: { runtime } });

      runtime.serial.connect.mockImplementation(async () => {
        runtime.serial.status.set('connecting');
        await new Promise((resolve) => setTimeout(resolve, 10));
        runtime.serial.status.set('error');
        runtime.serial.error.set('Port not available');
        throw new Error('Port not available');
      });

      await fireEvent.pointerDown(getByText('Connect'));
      await fireEvent.pointerUp(getByText('Connect'));

      await waitFor(() => {
        expect(getByText('Error: Port not available')).toBeInTheDocument();
        expect(getByText('Retry')).toBeInTheDocument();
      });
    });

    it('handles Web Serial API not supported', async () => {
      const { getByText } = render(App, { props: { runtime } });

      runtime.serial.connect.mockRejectedValue(
        new Error('Web Serial API not supported. Please use Chrome, Edge, or Opera.')
      );

      await fireEvent.pointerDown(getByText('Connect'));
      await fireEvent.pointerUp(getByText('Connect'));

      expect(runtime.serial.connect).toHaveBeenCalled();
    });
  });

  describe('Disconnection', () => {
    it('disconnects when button clicked', async () => {
      runtime.serial.status.set('connected');

      const { getByText } = render(App, { props: { runtime } });

      await fireEvent.pointerDown(getByText('Disconnect'));
      await fireEvent.pointerUp(getByText('Disconnect'));

      expect(runtime.serial.disconnect).toHaveBeenCalled();
    });

    it('handles disconnection during operation', async () => {
      runtime.serial.status.set('connected');
      const { getByText } = render(App, { props: { runtime } });

      runtime.serial.status.set('disconnected');

      await waitFor(() => {
        expect(getByText('Connect')).toBeInTheDocument();
      });
    });
  });

  describe('View Navigation', () => {
    it('shows dashboard when connected', () => {
      runtime.serial.status.set('connected');
      const { container } = render(App, { props: { runtime } });
      expect(container.querySelector('[data-testid=\"mock-dashboard\"]')).toBeInTheDocument();
    });

    it('navigates to channel detail', async () => {
      runtime.serial.status.set('connected');
      const { container, component } = render(App, { props: { runtime } });

      component.showChannelDetail(2);

      await waitFor(() => {
        const channelDetail = container.querySelector('[data-testid=\"mock-channel-detail\"]');
        expect(channelDetail).toBeInTheDocument();
        expect(channelDetail.textContent).toContain('Channel 3');
      });
    });

    it('navigates back to dashboard', async () => {
      runtime.serial.status.set('connected');
      const { container, component } = render(App, { props: { runtime } });

      component.showChannelDetail(1);
      await waitFor(() => {
        expect(container.querySelector('[data-testid=\"mock-channel-detail\"]')).toBeInTheDocument();
      });

      component.showDashboard();
      await waitFor(() => {
        expect(container.querySelector('[data-testid=\"mock-dashboard\"]')).toBeInTheDocument();
      });
    });

    it('shows placeholder when disconnected', () => {
      const { getByText } = render(App, { props: { runtime } });
      expect(getByText('Connect to your MDP device to begin')).toBeInTheDocument();
    });
  });
});
