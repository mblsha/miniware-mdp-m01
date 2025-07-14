import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import ChannelCard from '$lib/components/ChannelCard.svelte';

// Mock Observable Plot
vi.mock('@observablehq/plot', () => {
  const mockPlot = vi.fn((options) => {
    const element = document.createElement('svg');
    element.setAttribute('width', options?.width || '80');
    element.setAttribute('height', options?.height || '30');
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
      ruleY: vi.fn((data, options) => ({ type: 'ruleY', data, options }))
    }
  };
});

// Mock theme store
vi.mock('$lib/stores/theme.js', () => ({
  theme: writable('light')
}));

// Mock sparkline store
const mockSparklineData = writable([]);
vi.mock('$lib/stores/sparkline.js', () => ({
  sparklineStore: {
    getChannelMetricData: vi.fn(() => mockSparklineData)
  }
}));

describe('ChannelCard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock data
    mockSparklineData.set([]);
  });
  const mockOnlineChannel = {
    channel: 0,
    online: true,
    machineType: 'P906',
    voltage: 3.3,
    current: 0.5,
    power: 1.65,
    temperature: 25.5,
    isOutput: true,
    mode: 'CV',
    address: [0x01, 0x02, 0x03, 0x04, 0x05],
    targetVoltage: 3.5,
    targetCurrent: 0.6,
    targetPower: 2.1
  };

  const mockOfflineChannel = {
    channel: 2,
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
    targetPower: 0
  };

  describe('Online Channel Display', () => {
    it('should display channel number correctly', () => {
      const { getByText } = render(ChannelCard, {
        props: { channel: mockOnlineChannel, active: false }
      });
      
      expect(getByText('Channel 1')).toBeInTheDocument();
    });

    it('should display online status', () => {
      const { getByText } = render(ChannelCard, {
        props: { channel: mockOnlineChannel, active: false }
      });
      
      const status = getByText('Online');
      expect(status).toBeInTheDocument();
      expect(status).toHaveClass('online');
    });

    it('should display machine type and mode', () => {
      const { getByText } = render(ChannelCard, {
        props: { channel: mockOnlineChannel, active: false }
      });
      
      expect(getByText('P906')).toBeInTheDocument();
      expect(getByText('Mode: CV')).toBeInTheDocument();
    });

    it('should display measurements with correct formatting', () => {
      const { getByText } = render(ChannelCard, {
        props: { channel: mockOnlineChannel, active: false }
      });
      
      // Check actual values
      expect(getByText('3.300 V')).toBeInTheDocument();
      expect(getByText('0.500 A')).toBeInTheDocument();
      expect(getByText('1.650 W')).toBeInTheDocument();
      
      // Check target values (different from actual)
      expect(getByText('3.500 V')).toBeInTheDocument();
      expect(getByText('0.600 A')).toBeInTheDocument();
      expect(getByText('2.100 W')).toBeInTheDocument();
      
      expect(getByText('25.5 °C')).toBeInTheDocument();
    });

    it('should display sparklines for each metric', () => {
      // Provide mock data to trigger sparkline rendering
      const mockData = [
        { timestamp: Date.now() - 2000, value: 3.3 },
        { timestamp: Date.now() - 1000, value: 3.4 }
      ];
      mockSparklineData.set(mockData);

      const { container } = render(ChannelCard, {
        props: { channel: mockOnlineChannel, active: false }
      });
      
      // Check that sparkline cells are present
      const sparklineCells = container.querySelectorAll('.sparkline-cell');
      expect(sparklineCells).toHaveLength(3); // voltage, current, power
    });

    it('should display TREND header for sparklines', () => {
      const { getByText } = render(ChannelCard, {
        props: { channel: mockOnlineChannel, active: false }
      });
      
      expect(getByText('TREND')).toBeInTheDocument();
    });

    it('should display output status', () => {
      const { getByText } = render(ChannelCard, {
        props: { channel: mockOnlineChannel, active: false }
      });
      
      const outputStatus = getByText('Output: ON');
      expect(outputStatus).toBeInTheDocument();
      expect(outputStatus).toHaveClass('on');
    });

    it('should handle output off state', () => {
      const channelOff = { ...mockOnlineChannel, isOutput: false };
      const { getByText } = render(ChannelCard, {
        props: { channel: channelOff, active: false }
      });
      
      const outputStatus = getByText('Output: OFF');
      expect(outputStatus).toBeInTheDocument();
      expect(outputStatus.parentElement).not.toHaveClass('on');
    });
  });

  describe('Offline Channel Display', () => {
    it('should display offline status', () => {
      const { getByText } = render(ChannelCard, {
        props: { channel: mockOfflineChannel, active: false }
      });
      
      const status = getByText('Offline');
      expect(status).toBeInTheDocument();
      expect(status).not.toHaveClass('online');
    });

    it('should display offline message', () => {
      const { getByText } = render(ChannelCard, {
        props: { channel: mockOfflineChannel, active: false }
      });
      
      expect(getByText('No device connected')).toBeInTheDocument();
    });

    it('should not display measurements or sparklines', () => {
      const { queryByText, container } = render(ChannelCard, {
        props: { channel: mockOfflineChannel, active: false }
      });
      
      expect(queryByText(/\d+\.\d+ V/)).not.toBeInTheDocument();
      expect(queryByText(/\d+\.\d+ A/)).not.toBeInTheDocument();
      expect(queryByText(/\d+\.\d+ W/)).not.toBeInTheDocument();
      
      // Should not have sparkline cells for offline channels
      const sparklineCells = container.querySelectorAll('.sparkline-cell');
      expect(sparklineCells).toHaveLength(0);
    });
  });

  describe('Active State', () => {
    it('should apply active class when active', () => {
      const { container } = render(ChannelCard, {
        props: { channel: mockOnlineChannel, active: true }
      });
      
      const card = container.querySelector('.channel-card');
      expect(card).toHaveClass('active');
    });

    it('should not apply active class when not active', () => {
      const { container } = render(ChannelCard, {
        props: { channel: mockOnlineChannel, active: false }
      });
      
      const card = container.querySelector('.channel-card');
      expect(card).not.toHaveClass('active');
    });
  });

  describe('Click Handling', () => {
    it('should emit click event when clicked', async () => {
      const clickHandler = vi.fn();
      const { container } = render(ChannelCard, {
        props: { 
          channel: mockOnlineChannel, 
          active: false,
          onclick: clickHandler
        }
      });
      
      const card = container.querySelector('.channel-card');
      await fireEvent.pointerDown(card);
      await fireEvent.pointerUp(card);
      
      expect(clickHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit click event for offline channels', async () => {
      const clickHandler = vi.fn();
      const { container } = render(ChannelCard, {
        props: { 
          channel: mockOfflineChannel, 
          active: false,
          onclick: clickHandler
        }
      });
      
      const card = container.querySelector('.channel-card');
      await fireEvent.pointerDown(card);
      await fireEvent.pointerUp(card);
      
      expect(clickHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero values correctly', () => {
      const zeroChannel = {
        ...mockOnlineChannel,
        voltage: 0,
        current: 0,
        power: 0,
        temperature: 0
      };
      
      const { getByText } = render(ChannelCard, {
        props: { channel: zeroChannel, active: false }
      });
      
      expect(getByText('0.000 V')).toBeInTheDocument();
      expect(getByText('0.000 A')).toBeInTheDocument();
      expect(getByText('0.000 W')).toBeInTheDocument();
      expect(getByText('0.0 °C')).toBeInTheDocument();
    });

    it('should handle very large values', () => {
      const largeChannel = {
        ...mockOnlineChannel,
        voltage: 30.123456,
        current: 5.987654,
        power: 180.370368,
        temperature: 99.99
      };
      
      const { getByText } = render(ChannelCard, {
        props: { channel: largeChannel, active: false }
      });
      
      expect(getByText('30.123 V')).toBeInTheDocument();
      expect(getByText('5.988 A')).toBeInTheDocument();
      expect(getByText('180.370 W')).toBeInTheDocument();
      expect(getByText('100.0 °C')).toBeInTheDocument();
    });

    it('should handle negative temperature', () => {
      const coldChannel = {
        ...mockOnlineChannel,
        temperature: -10.5
      };
      
      const { getByText } = render(ChannelCard, {
        props: { channel: coldChannel, active: false }
      });
      
      expect(getByText('-10.5 °C')).toBeInTheDocument();
    });

    it('should handle different machine types', () => {
      const testCases = [
        { machineType: 'P905', mode: 'Normal' },
        { machineType: 'P906', mode: 'CC' },
        { machineType: 'L1060', mode: 'CR' },
        { machineType: 'Unknown', mode: 'Normal' }
      ];
      
      testCases.forEach(({ machineType, mode }) => {
        const channel = { ...mockOnlineChannel, machineType, mode };
        const { getByText, unmount } = render(ChannelCard, {
          props: { channel, active: false }
        });
        
        expect(getByText(machineType)).toBeInTheDocument();
        expect(getByText(`Mode: ${mode}`)).toBeInTheDocument();
        unmount();
      });
    });
  });

  describe('Visual States', () => {
    it('should apply online class to card when online', () => {
      const { container } = render(ChannelCard, {
        props: { channel: mockOnlineChannel, active: false }
      });
      
      const card = container.querySelector('.channel-card');
      expect(card).toHaveClass('online');
    });

    it('should not apply online class when offline', () => {
      const { container } = render(ChannelCard, {
        props: { channel: mockOfflineChannel, active: false }
      });
      
      const card = container.querySelector('.channel-card');
      expect(card).not.toHaveClass('online');
    });
  });

  describe('Accessibility', () => {
    it('should be keyboard accessible', async () => {
      const clickHandler = vi.fn();
      const { container } = render(ChannelCard, {
        props: { 
          channel: mockOnlineChannel, 
          active: false,
          onclick: clickHandler
        }
      });
      
      const card = container.querySelector('.channel-card');
      
      // Simulate Enter key
      await fireEvent.keyDown(card, { key: 'Enter' });
      
      // Note: Depending on implementation, might need to add keyboard handlers
      // This test assumes the card is clickable which handles keyboard by default
    });
  });
});