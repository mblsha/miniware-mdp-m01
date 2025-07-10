import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import App from '../../src/App.svelte';
import { createMockSerial, MockSerialPort } from '../mocks/serial-api.js';
import { createMachinePacket, createSynthesizePacket } from '../mocks/packet-data.js';

// Mock child components to isolate App component testing
vi.mock('../../src/lib/components/Dashboard.svelte', () => ({
  default: {
    name: 'Dashboard',
    props: [],
    $$render: () => '<div data-testid="dashboard">Dashboard</div>'
  }
}));

vi.mock('../../src/lib/components/ChannelDetail.svelte', () => ({
  default: {
    name: 'ChannelDetail',
    props: ['channel'],
    $$render: (result, props) => {
      result.push(`<div data-testid="channel-detail">Channel Detail ${props.channel}</div>`);
    }
  }
}));

describe('App Component', () => {
  let mockSerial;
  let mockPort;

  beforeEach(() => {
    vi.clearAllMocks();
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
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      const connectButton = getByText('Connect');
      await fireEvent.click(connectButton);
      
      // Should show connecting state
      await waitFor(() => {
        expect(getByText('Connecting...')).toBeInTheDocument();
      });
      
      // Should show connected state
      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
        expect(getByText('Disconnect')).toBeInTheDocument();
      });
      
      // Placeholder should be gone
      expect(queryByText('Connect to your MDP device to begin')).not.toBeInTheDocument();
    });

    it('should display device type when available', async () => {
      const { getByText } = render(App);
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.click(getByText('Connect'));
      
      // Simulate machine packet
      mockPort.simulateData(createMachinePacket(0x10));
      
      await waitFor(() => {
        expect(getByText('(M01)')).toBeInTheDocument();
      });
    });

    it('should handle M02 device type', async () => {
      const { getByText } = render(App);
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.click(getByText('Connect'));
      
      // Simulate M02 machine packet
      mockPort.simulateData(createMachinePacket(0x11));
      
      await waitFor(() => {
        expect(getByText('(M02)')).toBeInTheDocument();
      });
    });

    it('should handle connection errors', async () => {
      const { getByText } = render(App);
      
      mockSerial.requestPort.mockRejectedValue(new Error('Port not available'));
      
      await fireEvent.click(getByText('Connect'));
      
      await waitFor(() => {
        expect(getByText(/Error: Port not available/)).toBeInTheDocument();
        expect(getByText('Retry')).toBeInTheDocument();
      });
    });

    it('should allow retry after error', async () => {
      const { getByText } = render(App);
      
      // First attempt fails
      mockSerial.requestPort.mockRejectedValueOnce(new Error('Port busy'));
      await fireEvent.click(getByText('Connect'));
      
      await waitFor(() => {
        expect(getByText(/Error: Port busy/)).toBeInTheDocument();
      });
      
      // Second attempt succeeds
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.click(getByText('Retry'));
      
      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
      });
    });

    it('should handle user cancellation gracefully', async () => {
      const { getByText } = render(App);
      
      mockSerial.requestPort.mockRejectedValue(new DOMException('User cancelled'));
      
      await fireEvent.click(getByText('Connect'));
      
      // Should show error but not log to console
      await waitFor(() => {
        expect(getByText(/Error: User cancelled/)).toBeInTheDocument();
      });
    });

    it('should disconnect properly', async () => {
      const { getByText } = render(App);
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      // Connect
      await fireEvent.click(getByText('Connect'));
      await waitFor(() => expect(getByText('Disconnect')).toBeInTheDocument());
      
      // Disconnect
      await fireEvent.click(getByText('Disconnect'));
      
      await waitFor(() => {
        expect(getByText('Connect')).toBeInTheDocument();
        expect(getByText('Connect to your MDP device to begin')).toBeInTheDocument();
      });
    });
  });

  describe('View Management', () => {
    it('should show dashboard when connected', async () => {
      const { getByTestId, getByText } = render(App);
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.click(getByText('Connect'));
      
      await waitFor(() => {
        expect(getByTestId('dashboard')).toBeInTheDocument();
      });
    });

    it('should switch to channel detail view', async () => {
      const { getByTestId, getByText, component } = render(App);
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.click(getByText('Connect'));
      
      await waitFor(() => {
        expect(getByTestId('dashboard')).toBeInTheDocument();
      });
      
      // Simulate channel selection from dashboard
      const dashboard = component.$$.$$.ctx[0]; // Access component instance
      dashboard.showChannelDetail(2);
      
      await waitFor(() => {
        expect(getByTestId('channel-detail')).toBeInTheDocument();
        expect(getByText('Channel Detail 2')).toBeInTheDocument();
      });
    });

    it('should return to dashboard from channel detail', async () => {
      const { getByTestId, getByText, component } = render(App);
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.click(getByText('Connect'));
      
      // Go to channel detail
      const dashboard = component.$$.$$.ctx[0];
      dashboard.showChannelDetail(1);
      
      await waitFor(() => {
        expect(getByTestId('channel-detail')).toBeInTheDocument();
      });
      
      // Go back to dashboard
      dashboard.showDashboard();
      
      await waitFor(() => {
        expect(getByTestId('dashboard')).toBeInTheDocument();
      });
    });
  });

  describe('Header Display', () => {
    it('should always display MDP-WebUI title', () => {
      const { getByText } = render(App);
      expect(getByText('MDP-WebUI')).toBeInTheDocument();
    });

    it('should have correct header styling classes', () => {
      const { container } = render(App);
      const header = container.querySelector('header');
      
      expect(header).toBeInTheDocument();
      expect(header).toHaveStyle({ backgroundColor: '#1a1a1a' });
    });
  });

  describe('Error Handling', () => {
    it('should handle Web Serial API not available', async () => {
      delete global.navigator.serial;
      
      const { getByText } = render(App);
      
      await fireEvent.click(getByText('Connect'));
      
      await waitFor(() => {
        expect(getByText(/Web Serial API not supported/)).toBeInTheDocument();
      });
    });

    it('should handle unexpected disconnection', async () => {
      const { getByText } = render(App);
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.click(getByText('Connect'));
      await waitFor(() => expect(getByText('Connected')).toBeInTheDocument());
      
      // Simulate unexpected disconnection
      mockPort.simulateDisconnect();
      
      await waitFor(() => {
        expect(getByText(/Error:/)).toBeInTheDocument();
      });
    });
  });

  describe('Integration with Serial Connection', () => {
    it('should process incoming packets', async () => {
      const { getByText } = render(App);
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.click(getByText('Connect'));
      
      // Send machine packet
      mockPort.simulateData(createMachinePacket(0x10));
      
      // Send synthesize packet
      const channelData = [
        { online: 1, machineType: 0, voltage: 5000, current: 1000 }
      ];
      mockPort.simulateData(createSynthesizePacket(channelData));
      
      // Verify device type is displayed
      await waitFor(() => {
        expect(getByText('(M01)')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const { container } = render(App);
      
      const main = container.querySelector('main');
      expect(main).toBeInTheDocument();
      
      const buttons = container.querySelectorAll('button');
      buttons.forEach(button => {
        expect(button).toHaveAttribute('type', 'button');
      });
    });

    it('should be keyboard navigable', async () => {
      const { getByText } = render(App);
      
      const connectButton = getByText('Connect');
      connectButton.focus();
      
      expect(document.activeElement).toBe(connectButton);
      
      // Simulate Enter key
      await fireEvent.keyDown(connectButton, { key: 'Enter' });
      
      // Should trigger connection (mocked to fail without port)
      await waitFor(() => {
        expect(getByText(/Error:/)).toBeInTheDocument();
      });
    });
  });

  describe('Memory Management', () => {
    it('should clean up subscriptions on unmount', async () => {
      const { unmount, getByText } = render(App);
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.click(getByText('Connect'));
      
      // Unmount should not throw errors
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Styling Classes', () => {
    it('should apply correct status classes', async () => {
      const { container, getByText } = render(App);
      
      // Check disconnected state
      let status = container.querySelector('.status');
      expect(status).not.toBeInTheDocument();
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.click(getByText('Connect'));
      
      // Check connecting state
      await waitFor(() => {
        status = container.querySelector('.status.connecting');
        expect(status).toBeInTheDocument();
      });
      
      // Check connected state
      await waitFor(() => {
        status = container.querySelector('.status.connected');
        expect(status).toBeInTheDocument();
      });
    });

    it('should apply error status class', async () => {
      const { container, getByText } = render(App);
      
      mockSerial.requestPort.mockRejectedValue(new Error('Test error'));
      
      await fireEvent.click(getByText('Connect'));
      
      await waitFor(() => {
        const status = container.querySelector('.status.error');
        expect(status).toBeInTheDocument();
      });
    });
  });
});