import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import App from '../../src/App.svelte';

// Mock serial connection
vi.mock('$lib/serial.js', () => {
  const { writable } = require('svelte/store');
  const mockStatus = writable('disconnected');
  const mockError = writable(null);
  const mockDeviceType = writable(null);
  
  return {
    serialConnection: {
      status: mockStatus,
      error: mockError,
      deviceType: mockDeviceType,
      connect: vi.fn(),
      disconnect: vi.fn(),
      registerPacketHandler: vi.fn(),
      clearPacketHandlers: vi.fn(),
      sendPacket: vi.fn(),
      stopHeartbeat: vi.fn()
    },
    ConnectionStatus: {
      DISCONNECTED: 'disconnected',
      CONNECTING: 'connecting',
      CONNECTED: 'connected',
      ERROR: 'error'
    }
  };
});

// Mock channel store
vi.mock('$lib/stores/channels.js', () => {
  const { writable } = require('svelte/store');
  const mockChannels = writable(Array(6).fill(null).map((_, i) => ({
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
    waveformData: []
  })));
  
  return {
    channelStore: {
      channels: mockChannels,
      activeChannel: writable(0),
      reset: vi.fn(),
      setActiveChannel: vi.fn(),
      startRecording: vi.fn(),
      stopRecording: vi.fn()
    }
  };
});

// Mock Dashboard and ChannelDetail components
vi.mock('$lib/components/Dashboard.svelte', async () => {
  const MockDashboard = await import('../mocks/components/MockDashboard.svelte');
  return { default: MockDashboard.default };
});

vi.mock('$lib/components/ChannelDetail.svelte', async () => {
  const MockChannelDetail = await import('../mocks/components/MockChannelDetail.svelte');
  return { default: MockChannelDetail.default };
});

import { serialConnection, ConnectionStatus } from '$lib/serial.js';
import { channelStore } from '$lib/stores/channels.js';

describe('App Connection Management Tests', () => {
  const { status: mockStatus, error: mockError, deviceType: mockDeviceType } = serialConnection;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatus.set('disconnected');
    mockError.set(null);
    mockDeviceType.set(null);
  });

  describe('Connection States', () => {
    it('should show connect button when disconnected', () => {
      const { getByText } = render(App);
      
      expect(getByText('Connect')).toBeInTheDocument();
    });

    it('should show connecting state', async () => {
      const { getByText } = render(App);
      
      // Mock connect to set connecting state
      serialConnection.connect.mockImplementation(() => {
        mockStatus.set('connecting');
        return new Promise(() => {}); // Never resolves
      });
      
      await fireEvent.click(getByText('Connect'));
      
      await waitFor(() => {
        expect(getByText('Connecting...')).toBeInTheDocument();
      });
    });

    it('should show connected state with disconnect button', async () => {
      const { getByText } = render(App);
      
      // Mock successful connection
      serialConnection.connect.mockImplementation(async () => {
        mockStatus.set('connecting');
        await new Promise(resolve => setTimeout(resolve, 10));
        mockStatus.set('connected');
      });
      
      await fireEvent.click(getByText('Connect'));
      
      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
        expect(getByText('Disconnect')).toBeInTheDocument();
      });
    });

    it('should show device type when available', async () => {
      mockStatus.set('connected');
      mockDeviceType.set({ type: 'M01' });
      
      const { getByText } = render(App);
      
      expect(getByText('(M01)')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should show error state with retry button', async () => {
      const { getByText } = render(App);
      
      // Mock connection error
      serialConnection.connect.mockImplementation(async () => {
        mockStatus.set('connecting');
        await new Promise(resolve => setTimeout(resolve, 10));
        mockStatus.set('error');
        mockError.set('Port not available');
        throw new Error('Port not available');
      });
      
      await fireEvent.click(getByText('Connect'));
      
      await waitFor(() => {
        expect(getByText('Error: Port not available')).toBeInTheDocument();
        expect(getByText('Retry')).toBeInTheDocument();
      });
    });

    it('should handle Web Serial API not supported', async () => {
      const { getByText } = render(App);
      
      serialConnection.connect.mockRejectedValue(
        new Error('Web Serial API not supported. Please use Chrome, Edge, or Opera.')
      );
      
      await fireEvent.click(getByText('Connect'));
      
      // Error should be logged but UI handles gracefully
      expect(serialConnection.connect).toHaveBeenCalled();
    });
  });

  describe('Disconnection', () => {
    it('should disconnect when button clicked', async () => {
      mockStatus.set('connected');
      
      const { getByText } = render(App);
      
      await fireEvent.click(getByText('Disconnect'));
      
      expect(serialConnection.disconnect).toHaveBeenCalled();
    });

    it('should handle disconnection during operation', async () => {
      mockStatus.set('connected');
      
      const { getByText } = render(App);
      
      // Simulate sudden disconnection
      mockStatus.set('disconnected');
      
      await waitFor(() => {
        expect(getByText('Connect')).toBeInTheDocument();
      });
    });
  });

  describe('View Navigation', () => {
    it('should show dashboard when connected', async () => {
      mockStatus.set('connected');
      
      const { container } = render(App);
      
      expect(container.querySelector('[data-testid="mock-dashboard"]')).toBeInTheDocument();
    });

    it('should navigate to channel detail', async () => {
      mockStatus.set('connected');
      
      const { container, component } = render(App);
      
      // Call the navigation method
      component.showChannelDetail(2);
      
      await waitFor(() => {
        const channelDetail = container.querySelector('[data-testid="mock-channel-detail"]');
        expect(channelDetail).toBeInTheDocument();
        expect(channelDetail.textContent).toContain('Channel 3');
      });
    });

    it('should navigate back to dashboard', async () => {
      mockStatus.set('connected');
      
      const { container, component } = render(App);
      
      // Go to channel detail
      component.showChannelDetail(1);
      
      await waitFor(() => {
        expect(container.querySelector('[data-testid="mock-channel-detail"]')).toBeInTheDocument();
      });
      
      // Go back to dashboard
      component.showDashboard();
      
      await waitFor(() => {
        expect(container.querySelector('[data-testid="mock-dashboard"]')).toBeInTheDocument();
      });
    });

    it('should show placeholder when disconnected', () => {
      const { getByText } = render(App);
      
      expect(getByText('Connect to your MDP device to begin')).toBeInTheDocument();
    });
  });
});