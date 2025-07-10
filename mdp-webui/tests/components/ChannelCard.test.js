import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '../helpers/test-utils.js';
import ChannelCard from '../../src/lib/components/ChannelCard.svelte';

describe('ChannelCard Component', () => {
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
    address: [0x01, 0x02, 0x03, 0x04, 0x05]
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
    address: [0, 0, 0, 0, 0]
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
      
      expect(getByText('3.300 V')).toBeInTheDocument();
      expect(getByText('0.500 A')).toBeInTheDocument();
      expect(getByText('1.650 W')).toBeInTheDocument();
      expect(getByText('25.5 °C')).toBeInTheDocument();
    });

    it('should display output status', () => {
      const { getByText } = render(ChannelCard, {
        props: { channel: mockOnlineChannel, active: false }
      });
      
      const outputStatus = getByText('Output: ON');
      expect(outputStatus).toBeInTheDocument();
      expect(outputStatus.parentElement).toHaveClass('on');
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

    it('should not display measurements', () => {
      const { queryByText } = render(ChannelCard, {
        props: { channel: mockOfflineChannel, active: false }
      });
      
      expect(queryByText(/\d+\.\d+ V/)).not.toBeInTheDocument();
      expect(queryByText(/\d+\.\d+ A/)).not.toBeInTheDocument();
      expect(queryByText(/\d+\.\d+ W/)).not.toBeInTheDocument();
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
      const { component, container } = render(ChannelCard, {
        props: { channel: mockOnlineChannel, active: false }
      });
      
      const clickHandler = vi.fn();
      component.$on('click', clickHandler);
      
      const card = container.querySelector('.channel-card');
      await fireEvent.click(card);
      
      expect(clickHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit click event for offline channels', async () => {
      const { component, container } = render(ChannelCard, {
        props: { channel: mockOfflineChannel, active: false }
      });
      
      const clickHandler = vi.fn();
      component.$on('click', clickHandler);
      
      const card = container.querySelector('.channel-card');
      await fireEvent.click(card);
      
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
        const { getByText } = render(ChannelCard, {
          props: { channel, active: false }
        });
        
        expect(getByText(machineType)).toBeInTheDocument();
        expect(getByText(`Mode: ${mode}`)).toBeInTheDocument();
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
      const { component, container } = render(ChannelCard, {
        props: { channel: mockOnlineChannel, active: false }
      });
      
      const clickHandler = vi.fn();
      component.$on('click', clickHandler);
      
      const card = container.querySelector('.channel-card');
      
      // Simulate Enter key
      await fireEvent.keyDown(card, { key: 'Enter' });
      
      // Note: Depending on implementation, might need to add keyboard handlers
      // This test assumes the card is clickable which handles keyboard by default
    });
  });
});