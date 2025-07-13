import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { createMockSerial, MockSerialPort } from '../mocks/serial-api.js';
import { createMachinePacket, createSynthesizePacket } from '../mocks/packet-data.js';

// Mock serial.js with simplified store mocking
const mockConnect = vi.hoisted(() => vi.fn());
const mockDisconnect = vi.hoisted(() => vi.fn());

vi.mock('$lib/serial.js', () => {
  const { writable } = require('svelte/store');
  return {
    serialConnection: {
      status: writable('disconnected'),
      error: writable(null),
      deviceType: writable(null),
      connect: mockConnect,
      disconnect: mockDisconnect,
    },
    ConnectionStatus: {
      DISCONNECTED: 'disconnected',
      CONNECTING: 'connecting', 
      CONNECTED: 'connected',
      ERROR: 'error'
    }
  };
});

// Mock child components with proper Svelte components BEFORE other imports
vi.mock('$lib/components/Dashboard.svelte', async () => ({
  default: (await vi.importActual('../mocks/components/MockDashboard.svelte')).default
}));
vi.mock('$lib/components/ChannelDetail.svelte', async () => ({
  default: (await vi.importActual('../mocks/components/MockChannelDetail.svelte')).default
}));

vi.mock('$lib/stores/channels.js', () => {
  const { writable } = require('svelte/store');
  const mockChannels = writable([
    { channel: 0, online: true, voltage: 3.3, current: 0.5, power: 1.65, temperature: 25, isOutput: false, machineType: 'P906', recording: false, waveformData: [] },
    { channel: 1, online: true, voltage: 5.0, current: 1.0, power: 5.0, temperature: 30, isOutput: true, machineType: 'P906', recording: false, waveformData: [] },
    { channel: 2, online: true, voltage: 12.0, current: 0.2, power: 2.4, temperature: 28, isOutput: false, machineType: 'L1060', recording: false, waveformData: [] },
    { channel: 3, online: true, voltage: 0, current: 0, power: 0, temperature: 22, isOutput: false, machineType: 'P906', recording: false, waveformData: [] },
    { channel: 4, online: false, voltage: 0, current: 0, power: 0, temperature: 0, isOutput: false, machineType: '', recording: false, waveformData: [] },
    { channel: 5, online: false, voltage: 0, current: 0, power: 0, temperature: 0, isOutput: false, machineType: '', recording: false, waveformData: [] }
  ]);
  
  return {
    channelStore: {
      channels: mockChannels,
      setOutput: vi.fn(),
      setVoltage: vi.fn(),
      setCurrent: vi.fn(),
      startRecording: vi.fn(),
      stopRecording: vi.fn()
    }
  };
});

import App from '../../src/App.svelte';
import { serialConnection } from '$lib/serial.js';

describe('App Component', () => {
  let mockSerial;
  let mockPort;

  beforeEach(() => {
    vi.clearAllMocks();
    serialConnection.status.set('disconnected');
    serialConnection.error.set(null);
    serialConnection.deviceType.set(null);
    mockConnect.mockResolvedValue();
    mockSerial = createMockSerial();
    global.navigator.serial = mockSerial;
  });

  describe('Connection Management', () => {
    it('should render connect button when disconnected', () => {
      const { getByText } = render(App);
      expect(getByText('Connect')).toBeInTheDocument();
    });

    it('should show placeholder when not connected', () => {
      const { getByText } = render(App);
      expect(getByText('Connect to your MDP device to begin')).toBeInTheDocument();
    });

    it('should handle connection flow', async () => {
      const { getByText, queryByText } = render(App);

      const connectButton = getByText('Connect');
      mockConnect.mockImplementation(async () => {
        serialConnection.status.set('connecting');
        await new Promise(resolve => setTimeout(resolve, 10));
        serialConnection.status.set('connected');
      });
      await fireEvent.click(connectButton);
      
      // Wait for connection to complete
      await waitFor(() => {
        expect(getByText('Disconnect')).toBeInTheDocument();
      });
      
      // Placeholder should be gone
      expect(queryByText('Connect to your MDP device to begin')).not.toBeInTheDocument();
    });

    it('should display device type when available', async () => {
      const { getByText } = render(App);
      serialConnection.status.set('connected');
      serialConnection.deviceType.set({ type: 'M01' });
      
      await waitFor(() => {
        expect(getByText('(M01)')).toBeInTheDocument();
      });
    });

    it('should handle connection errors', async () => {
      const { getByText } = render(App);
      mockConnect.mockRejectedValue(new Error('Port not available'));
      await fireEvent.click(getByText('Connect'));
      serialConnection.status.set('error');
      serialConnection.error.set('Port not available');
      
      await waitFor(() => {
        expect(getByText(/Error: Port not available/)).toBeInTheDocument();
      });
    });

    it('should handle disconnect', async () => {
      const { getByText } = render(App);
      
      // First connect
      serialConnection.status.set('connected');
      
      await waitFor(() => {
        expect(getByText('Disconnect')).toBeInTheDocument();
      });
      
      // Then disconnect
      mockDisconnect.mockImplementation(() => {
        serialConnection.status.set('disconnected');
      });
      
      await fireEvent.click(getByText('Disconnect'));
      
      await waitFor(() => {
        expect(getByText('Connect')).toBeInTheDocument();
      });
    });
  });

  describe('View Management', () => {
    it('should show dashboard when connected', async () => {
      const { getByTestId } = render(App);
      serialConnection.status.set('connected');
      await tick();
      
      await waitFor(() => {
        expect(getByTestId('mock-dashboard')).toBeInTheDocument();
      });
    });

    it('should switch to channel detail view', async () => {
      const { component, getByTestId } = render(App);
      serialConnection.status.set('connected');
      await tick();
      
      await waitFor(() => {
        expect(getByTestId('mock-dashboard')).toBeInTheDocument();
      });
      
      // Simulate channel selection by calling the component function directly
      component.showChannelDetail(2);
      await tick();
      
      await waitFor(() => {
        expect(getByTestId('mock-channel-detail')).toBeInTheDocument();
      });
    });

    it('should return to dashboard from detail view', async () => {
      const { component, getByTestId } = render(App);
      serialConnection.status.set('connected');
      
      await waitFor(() => {
        expect(getByTestId('mock-dashboard')).toBeInTheDocument();
      });
      
      // First go to detail view
      component.showChannelDetail(3);
      
      await waitFor(() => {
        expect(getByTestId('mock-channel-detail')).toBeInTheDocument();
      });
      
      // Then go back
      component.showDashboard();
      
      await waitFor(() => {
        expect(getByTestId('mock-dashboard')).toBeInTheDocument();
      });
    });
  });

  describe('Error States', () => {
    it('should display connection errors prominently', async () => {
      const { getByText } = render(App);
      
      serialConnection.status.set('error');
      serialConnection.error.set('Device disconnected unexpectedly');
      
      await waitFor(() => {
        const errorElement = getByText(/Error: Device disconnected unexpectedly/);
        expect(errorElement).toBeInTheDocument();
        expect(errorElement).toHaveClass('error');
      });
    });

    it('should clear error when reconnecting', async () => {
      const { getByText, queryByText } = render(App);
      
      // Start with error
      serialConnection.status.set('error');
      serialConnection.error.set('Connection failed');
      
      await waitFor(() => {
        expect(getByText(/Error: Connection failed/)).toBeInTheDocument();
      });
      
      // Clear error on successful connection
      serialConnection.status.set('connected');
      serialConnection.error.set(null);
      
      await waitFor(() => {
        expect(queryByText(/Error:/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Browser Compatibility', () => {
    it('should show error when Web Serial is not supported', async () => {
      // Mock the connection to reject with Web Serial API error
      mockConnect.mockImplementation(async () => {
        // Simulate the serial connection error state changes
        serialConnection.status.set('error');
        serialConnection.error.set('Web Serial API not supported. Please use Chrome, Edge, or Opera.');
        throw new Error('Web Serial API not supported. Please use Chrome, Edge, or Opera.');
      });
      
      const { getByText } = render(App);
      
      const connectButton = getByText('Connect');
      await fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(getByText(/Web Serial API not supported/)).toBeInTheDocument();
      });
    });
  });
});