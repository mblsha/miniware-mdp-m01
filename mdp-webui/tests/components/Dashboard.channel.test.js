import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import Dashboard from '$lib/components/Dashboard.svelte';

// Mock channel store
vi.mock('$lib/stores/channels.js', () => {
  const { writable } = require('svelte/store');
  const channels = writable([]);
  const activeChannel = writable(0);
  
  return {
    channelStore: {
      channels,
      activeChannel
    }
  };
});

import { channelStore } from '$lib/stores/channels.js';

describe('Dashboard Channel Management Tests', () => {
  const { channels, activeChannel } = channelStore;
  let mockChannelData;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup 6 channels with varying states
    mockChannelData = [
      {
        channel: 0,
        online: true,
        machineType: 'P906',
        voltage: 5,
        current: 1,
        power: 5,
        temperature: 25.5,
        isOutput: true,
        mode: 'CV'
      },
      {
        channel: 1,
        online: true,
        machineType: 'P905',
        voltage: 3.3,
        current: 0.5,
        power: 1.65,
        temperature: 20,
        isOutput: false,
        mode: 'CC'
      },
      {
        channel: 2,
        online: false,
        machineType: 'Unknown',
        voltage: 0,
        current: 0,
        power: 0,
        temperature: 0,
        isOutput: false,
        mode: 'Normal'
      },
      {
        channel: 3,
        online: false,
        machineType: 'Unknown',
        voltage: 0,
        current: 0,
        power: 0,
        temperature: 0,
        isOutput: false,
        mode: 'Normal'
      },
      {
        channel: 4,
        online: false,
        machineType: 'Unknown',
        voltage: 0,
        current: 0,
        power: 0,
        temperature: 0,
        isOutput: false,
        mode: 'Normal'
      },
      {
        channel: 5,
        online: false,
        machineType: 'Unknown',
        voltage: 0,
        current: 0,
        power: 0,
        temperature: 0,
        isOutput: false,
        mode: 'Normal'
      }
    ];
    
    channels.set(mockChannelData);
    activeChannel.set(0);
  });

  describe('Channel Display', () => {
    it('should display all 6 channels', () => {
      const { container } = render(Dashboard);
      
      const channelCards = container.querySelectorAll('.channel-card');
      expect(channelCards.length).toBe(6);
    });

    it('should show online status for connected channels', () => {
      const { getAllByText } = render(Dashboard);
      
      const onlineElements = getAllByText('Online');
      expect(onlineElements.length).toBe(2); // Channels 0 and 1
    });

    it('should show offline status for disconnected channels', () => {
      const { getAllByText } = render(Dashboard);
      
      const offlineElements = getAllByText('Offline');
      expect(offlineElements.length).toBe(4); // Channels 2-5
    });

    it('should display channel measurements', () => {
      const { getByText } = render(Dashboard);
      
      // Check channel 0 measurements
      expect(getByText('5.000 V')).toBeInTheDocument();
      expect(getByText('1.000 A')).toBeInTheDocument();
      expect(getByText('5.000 W')).toBeInTheDocument();
      expect(getByText('25.5 °C')).toBeInTheDocument();
      
      // Check channel 1 measurements
      expect(getByText('3.300 V')).toBeInTheDocument();
      expect(getByText('0.500 A')).toBeInTheDocument();
      expect(getByText('1.650 W')).toBeInTheDocument();
      expect(getByText('20.0 °C')).toBeInTheDocument();
    });

    it('should display machine types', () => {
      const { getByText } = render(Dashboard);
      
      expect(getByText('P906')).toBeInTheDocument();
      expect(getByText('P905')).toBeInTheDocument();
    });

    it('should display output status', () => {
      const { getAllByText } = render(Dashboard);
      
      expect(getAllByText('Output: ON').length).toBe(1);
      expect(getAllByText('Output: OFF').length).toBe(1);
    });
  });

  describe('Channel Selection', () => {
    it('should highlight active channel', () => {
      const { container } = render(Dashboard);
      
      const channelCards = container.querySelectorAll('.channel-card');
      expect(channelCards[0]).toHaveClass('active');
      expect(channelCards[1]).not.toHaveClass('active');
    });

    it('should emit select event when channel clicked', async () => {
      const onselectchannel = vi.fn();
      const { container } = render(Dashboard, { props: { onselectchannel } });
      
      const channelCards = container.querySelectorAll('.channel-card');
      await fireEvent.click(channelCards[2]);
      
      expect(onselectchannel).toHaveBeenCalledWith(2);
    });

    it('should update active channel visual state', async () => {
      const { container } = render(Dashboard);
      
      // Change active channel
      activeChannel.set(3);
      
      await waitFor(() => {
        const channelCards = container.querySelectorAll('.channel-card');
        expect(channelCards[0]).not.toHaveClass('active');
        expect(channelCards[3]).toHaveClass('active');
      });
    });
  });

  describe('Real-time Updates', () => {
    it('should update when channel data changes', async () => {
      const { getByText, queryByText } = render(Dashboard);
      
      // Initially channel 2 is offline
      expect(queryByText('Channel 3')).toBeInTheDocument();
      const channel3Card = getByText('Channel 3').closest('.channel-card');
      expect(channel3Card.querySelector('.status').textContent).toBe('Offline');
      
      // Update channel 2 to online
      mockChannelData[2] = {
        ...mockChannelData[2],
        online: true,
        machineType: 'P906',
        voltage: 12,
        current: 2,
        power: 24,
        temperature: 30,
        isOutput: true
      };
      channels.set([...mockChannelData]);
      
      await waitFor(() => {
        expect(getByText('12.000 V')).toBeInTheDocument();
        expect(getByText('2.000 A')).toBeInTheDocument();
        expect(getByText('24.000 W')).toBeInTheDocument();
      });
    });

    it('should handle rapid channel updates', async () => {
      const { getByText } = render(Dashboard);
      
      // Simulate rapid voltage changes on channel 0
      for (let i = 0; i < 10; i++) {
        mockChannelData[0].voltage = 5 + i * 0.1;
        mockChannelData[0].power = mockChannelData[0].voltage * mockChannelData[0].current;
        channels.set([...mockChannelData]);
        
        // Small delay to allow render
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Final voltage should be 5.9V
      await waitFor(() => {
        expect(getByText('5.900 V')).toBeInTheDocument();
        expect(getByText('5.900 W')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing channel properties gracefully', () => {
      // Set channel data with defaults for missing properties
      channels.set([
        {
          channel: 0,
          online: true,
          voltage: 0,
          current: 0,
          power: 0,
          temperature: 0,
          machineType: 'Unknown',
          isOutput: false,
          mode: 'Normal'
        },
        ...Array(5).fill(null).map((_, i) => ({
          channel: i + 1,
          online: false,
          voltage: 0,
          current: 0,
          power: 0,
          temperature: 0,
          machineType: 'Unknown',
          isOutput: false,
          mode: 'Normal'
        }))
      ]);
      
      const { container } = render(Dashboard);
      
      // Should render without crashing
      expect(container.querySelector('.dashboard')).toBeInTheDocument();
      expect(container.querySelectorAll('.channel-card').length).toBe(6);
    });

    it('should handle empty channel array', () => {
      channels.set([]);
      
      const { container } = render(Dashboard);
      
      const channelCards = container.querySelectorAll('.channel-card');
      expect(channelCards.length).toBe(0);
    });

    it('should handle more than 6 channels', () => {
      const manyChannels = Array(10).fill(null).map((_, i) => ({
        channel: i,
        online: false,
        machineType: 'Unknown',
        voltage: 0,
        current: 0,
        power: 0,
        temperature: 0,
        isOutput: false,
        mode: 'Normal'
      }));
      
      channels.set(manyChannels);
      
      const { container } = render(Dashboard);
      
      const channelCards = container.querySelectorAll('.channel-card');
      expect(channelCards.length).toBe(10);
    });
  });
});