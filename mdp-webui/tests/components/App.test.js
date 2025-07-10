import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { createMockSerial, MockSerialPort } from '../mocks/serial-api.js';
import { createMachinePacket, createSynthesizePacket } from '../mocks/packet-data.js';
import { writable } from 'svelte/store';

// Mocks must be declared before vi.mock and component import
const mockStatus = writable('disconnected');
const mockError = writable(null);
const mockDeviceType = writable(null);
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

vi.mock('../../src/lib/serial.js', () => ({
  serialConnection: {
    status: mockStatus,
    error: mockError,
    deviceType: mockDeviceType,
    connect: mockConnect,
    disconnect: mockDisconnect,
  },
  ConnectionStatus: {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error'
  }
}));

vi.mock('../../src/lib/stores/channels.js', () => ({
  channelStore: {}
}));

// Mock child components to isolate App component testing
vi.mock('../../src/lib/components/Dashboard.svelte', () => ({ default: class { constructor(options) { this.options = options; } } }));
vi.mock('../../src/lib/components/ChannelDetail.svelte', () => ({ default: class { constructor(options) { this.options = options; } } }));

import App from '../../src/App.svelte';

describe('App Component', () => {
  let mockSerial;
  let mockPort;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStatus.set('disconnected');
    mockError.set(null);
    mockDeviceType.set(null);
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
      mockConnect.mockImplementation(() => {
        mockStatus.set('connecting');
        setTimeout(() => mockStatus.set('connected'), 10);
      });
      await fireEvent.click(connectButton);
      
      // Placeholder should be gone
      expect(queryByText('Connect to your MDP device to begin')).not.toBeInTheDocument();
    });

    it('should display device type when available', async () => {
      const { getByText } = render(App);
      mockStatus.set('connected');
      mockDeviceType.set({ type: 'M01' });
      
      await waitFor(() => {
        expect(getByText('(M01)')).toBeInTheDocument();
      });
    });

    it('should handle connection errors', async () => {
      const { getByText } = render(App);
      mockConnect.mockRejectedValue(new Error('Port not available'));
      await fireEvent.click(getByText('Connect'));
      mockStatus.set('error');
      mockError.set('Port not available');
      
      await waitFor(() => {
        expect(getByText(/Error: Port not available/)).toBeInTheDocument();
      });
    });

    it('should handle disconnect', async () => {
      const { getByText } = render(App);
      
      // First connect
      mockStatus.set('connected');
      
      await waitFor(() => {
        expect(getByText('Disconnect')).toBeInTheDocument();
      });
      
      // Then disconnect
      mockDisconnect.mockImplementation(() => {
        mockStatus.set('disconnected');
      });
      
      await fireEvent.click(getByText('Disconnect'));
      
      await waitFor(() => {
        expect(getByText('Connect')).toBeInTheDocument();
      });
    });
  });

  describe('View Management', () => {
    it('should show dashboard when connected', async () => {
      const { container } = render(App);
      mockStatus.set('connected');
      
      await waitFor(() => {
        // Since we're mocking Dashboard as a class, we can't test its content
        // But we can verify the component was instantiated
        expect(container.querySelector('.placeholder')).not.toBeInTheDocument();
      });
    });

    it('should switch to channel detail view', async () => {
      const { component, container } = render(App);
      mockStatus.set('connected');
      
      // Simulate channel selection
      const channelSelectEvent = new CustomEvent('channelSelect', { detail: 2 });
      component.$$.ctx[0].dispatchEvent(channelSelectEvent);
      
      await waitFor(() => {
        // Verify we're in detail view by checking the view state
        expect(component.view).toBe('detail');
        expect(component.selectedChannel).toBe(2);
      });
    });

    it('should return to dashboard from detail view', async () => {
      const { component } = render(App);
      mockStatus.set('connected');
      
      // First go to detail view
      component.view = 'detail';
      component.selectedChannel = 3;
      
      // Then go back
      const backEvent = new CustomEvent('back');
      component.$$.ctx[0].dispatchEvent(backEvent);
      
      await waitFor(() => {
        expect(component.view).toBe('dashboard');
      });
    });
  });

  describe('Error States', () => {
    it('should display connection errors prominently', async () => {
      const { getByText } = render(App);
      
      mockStatus.set('error');
      mockError.set('Device disconnected unexpectedly');
      
      await waitFor(() => {
        const errorElement = getByText(/Error: Device disconnected unexpectedly/);
        expect(errorElement).toBeInTheDocument();
        expect(errorElement).toHaveClass('error');
      });
    });

    it('should clear error when reconnecting', async () => {
      const { getByText, queryByText } = render(App);
      
      // Start with error
      mockStatus.set('error');
      mockError.set('Connection failed');
      
      await waitFor(() => {
        expect(getByText(/Error: Connection failed/)).toBeInTheDocument();
      });
      
      // Clear error on successful connection
      mockStatus.set('connected');
      mockError.set(null);
      
      await waitFor(() => {
        expect(queryByText(/Error:/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Browser Compatibility', () => {
    it('should show error when Web Serial is not supported', () => {
      delete global.navigator.serial;
      
      const { getByText } = render(App);
      
      expect(getByText(/Web Serial API is not supported/)).toBeInTheDocument();
    });
  });
});