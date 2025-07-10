import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { createMockSerial, MockSerialPort } from '../mocks/serial-api.js';
import { createMachinePacket, createSynthesizePacket } from '../mocks/packet-data.js';

// Mock serial.js with simplified store mocking
vi.mock('../../src/lib/serial.js', () => {
  const { writable } = require('svelte/store');
  return {
    serialConnection: {
      status: writable('disconnected'),
      error: writable(null),
      deviceType: writable(null),
      connect: vi.fn(),
      disconnect: vi.fn(),
    },
    ConnectionStatus: {
      DISCONNECTED: 'disconnected',
      CONNECTING: 'connecting', 
      CONNECTED: 'connected',
      ERROR: 'error'
    }
  };
});

vi.mock('../../src/lib/stores/channels.js', () => ({
  channelStore: {}
}));

// Mock child components with proper Svelte components
vi.mock('../../src/lib/components/Dashboard.svelte', () => {
  return import('../mocks/components/MockDashboard.svelte');
});
vi.mock('../../src/lib/components/ChannelDetail.svelte', () => {
  return import('../mocks/components/MockChannelDetail.svelte');
});

import App from '../../src/App.svelte';
import { serialConnection } from '../../src/lib/serial.js';

describe('App Component', () => {
  let mockSerial;
  let mockPort;

  beforeEach(() => {
    vi.clearAllMocks();
    serialConnection.status.set('disconnected');
    serialConnection.error.set(null);
    serialConnection.deviceType.set(null);
    serialConnection.connect.mockResolvedValue();
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
      serialConnection.connect.mockImplementation(async () => {
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
      serialConnection.connect.mockRejectedValue(new Error('Port not available'));
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
      serialConnection.disconnect.mockImplementation(() => {
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
      
      await waitFor(() => {
        expect(getByTestId('mock-dashboard')).toBeInTheDocument();
      });
    });

    it('should switch to channel detail view', async () => {
      const { component, getByTestId } = render(App);
      serialConnection.status.set('connected');
      
      await waitFor(() => {
        expect(getByTestId('mock-dashboard')).toBeInTheDocument();
      });
      
      // Simulate channel selection by calling the component function directly
      component.showChannelDetail(2);
      
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
      serialConnection.connect.mockImplementation(async () => {
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