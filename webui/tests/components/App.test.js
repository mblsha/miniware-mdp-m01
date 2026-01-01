import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';

// Mock child components with proper Svelte components BEFORE importing App
vi.mock('$lib/components/Dashboard.svelte', async () => ({
  default: (await vi.importActual('../mocks/components/MockDashboard.svelte')).default,
}));
vi.mock('$lib/components/ChannelDetail.svelte', async () => ({
  default: (await vi.importActual('../mocks/components/MockChannelDetail.svelte')).default,
}));

import App from '../../src/App.svelte';

function createRuntimeStub() {
  const status = writable('disconnected');
  const error = writable(null);
  const deviceType = writable(null);
  const connect = vi.fn();
  const disconnect = vi.fn();

  const channels = writable(
    Array.from({ length: 6 }, (_, i) => ({
      channel: i,
      online: i < 4,
      voltage: i === 0 ? 3.3 : i === 1 ? 5.0 : i === 2 ? 12.0 : 0,
      current: i === 0 ? 0.5 : i === 1 ? 1.0 : i === 2 ? 0.2 : 0,
      power: i === 0 ? 1.65 : i === 1 ? 5.0 : i === 2 ? 2.4 : 0,
      temperature: i < 4 ? 25 : 0,
      isOutput: i === 1,
      machineType: i === 2 ? 'L1060' : 'P906',
      mode: 'Normal',
      recording: false,
      waveformData: [],
    }))
  );

  const channelStore = {
    channels,
    setOutput: vi.fn(),
    setVoltage: vi.fn(),
    setCurrent: vi.fn(),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    setActiveChannel: vi.fn(),
  };

  return {
    serial: { status, error, deviceType, connect, disconnect },
    channels: channelStore,
    packets: {},
    sparklines: {},
    timeseries: {},
    timeseriesIntegration: {},
    destroy: vi.fn(),
  };
}

describe('App Component', () => {
  let runtime;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = createRuntimeStub();
  });

  describe('Connection Management', () => {
    it('renders connect button when disconnected', () => {
      const { getByText } = render(App, { props: { runtime } });
      expect(getByText('Connect')).toBeInTheDocument();
    });

    it('shows placeholder when not connected', () => {
      const { getByText } = render(App, { props: { runtime } });
      expect(getByText('Connect to your MDP device to begin')).toBeInTheDocument();
    });

    it('handles connection flow', async () => {
      const { getByText, queryByText } = render(App, { props: { runtime } });

      runtime.serial.connect.mockImplementation(async () => {
        runtime.serial.status.set('connecting');
        await new Promise((resolve) => setTimeout(resolve, 10));
        runtime.serial.status.set('connected');
      });

      const connectButton = getByText('Connect');
      await fireEvent.pointerDown(connectButton);
      await fireEvent.pointerUp(connectButton);

      await waitFor(() => {
        expect(getByText('Disconnect')).toBeInTheDocument();
      });
      expect(queryByText('Connect to your MDP device to begin')).not.toBeInTheDocument();
    });

    it('displays device type when available', async () => {
      const { getByText } = render(App, { props: { runtime } });
      runtime.serial.status.set('connected');
      runtime.serial.deviceType.set({ type: 'M01' });

      await waitFor(() => {
        expect(getByText('(M01)')).toBeInTheDocument();
      });
    });

    it('handles connection errors', async () => {
      const { getByText } = render(App, { props: { runtime } });

      runtime.serial.connect.mockRejectedValue(new Error('Port not available'));
      await fireEvent.pointerDown(getByText('Connect'));
      await fireEvent.pointerUp(getByText('Connect'));

      runtime.serial.status.set('error');
      runtime.serial.error.set('Port not available');

      await waitFor(() => {
        expect(getByText(/Error: Port not available/)).toBeInTheDocument();
      });
    });

    it('handles disconnect', async () => {
      const { getByText } = render(App, { props: { runtime } });

      runtime.serial.status.set('connected');

      await waitFor(() => {
        expect(getByText('Disconnect')).toBeInTheDocument();
      });

      runtime.serial.disconnect.mockImplementation(async () => {
        runtime.serial.status.set('disconnected');
      });

      await fireEvent.pointerDown(getByText('Disconnect'));
      await fireEvent.pointerUp(getByText('Disconnect'));

      await waitFor(() => {
        expect(getByText('Connect')).toBeInTheDocument();
      });
    });
  });

  describe('View Management', () => {
    it('shows dashboard when connected', async () => {
      const { getByTestId } = render(App, { props: { runtime } });
      runtime.serial.status.set('connected');
      await tick();

      await waitFor(() => {
        expect(getByTestId('mock-dashboard')).toBeInTheDocument();
      });
    });

    it('switches to channel detail view', async () => {
      const { component, getByTestId } = render(App, { props: { runtime } });
      runtime.serial.status.set('connected');
      await tick();

      await waitFor(() => {
        expect(getByTestId('mock-dashboard')).toBeInTheDocument();
      });

      component.showChannelDetail(2);
      await tick();

      await waitFor(() => {
        expect(getByTestId('mock-channel-detail')).toBeInTheDocument();
      });
    });

    it('returns to dashboard from detail view', async () => {
      const { component, getByTestId } = render(App, { props: { runtime } });
      runtime.serial.status.set('connected');

      await waitFor(() => {
        expect(getByTestId('mock-dashboard')).toBeInTheDocument();
      });

      component.showChannelDetail(3);
      await waitFor(() => {
        expect(getByTestId('mock-channel-detail')).toBeInTheDocument();
      });

      component.showDashboard();
      await waitFor(() => {
        expect(getByTestId('mock-dashboard')).toBeInTheDocument();
      });
    });
  });

  describe('Error States', () => {
    it('displays connection errors prominently', async () => {
      const { getByText } = render(App, { props: { runtime } });

      runtime.serial.status.set('error');
      runtime.serial.error.set('Device disconnected unexpectedly');

      await waitFor(() => {
        const errorElement = getByText(/Error: Device disconnected unexpectedly/);
        expect(errorElement).toBeInTheDocument();
        expect(errorElement).toHaveClass('error');
      });
    });

    it('clears error when reconnecting', async () => {
      const { getByText, queryByText } = render(App, { props: { runtime } });

      runtime.serial.status.set('error');
      runtime.serial.error.set('Connection failed');

      await waitFor(() => {
        expect(getByText(/Error: Connection failed/)).toBeInTheDocument();
      });

      runtime.serial.status.set('connected');
      runtime.serial.error.set(null);

      await waitFor(() => {
        expect(queryByText(/Error:/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Browser Compatibility', () => {
    it('shows error when Web Serial is not supported', async () => {
      runtime.serial.connect.mockImplementation(async () => {
        runtime.serial.status.set('error');
        runtime.serial.error.set('Web Serial API not supported. Please use Chrome, Edge, or Opera.');
        throw new Error('Web Serial API not supported. Please use Chrome, Edge, or Opera.');
      });

      const { getByText } = render(App, { props: { runtime } });

      const connectButton = getByText('Connect');
      await fireEvent.pointerDown(connectButton);
      await fireEvent.pointerUp(connectButton);

      await waitFor(() => {
        expect(getByText(/Web Serial API not supported/)).toBeInTheDocument();
      });
    });
  });
});
