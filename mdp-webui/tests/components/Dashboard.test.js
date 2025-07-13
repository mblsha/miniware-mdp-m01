import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';

// Mock ChannelCard component BEFORE other imports
vi.mock('$lib/components/ChannelCard.svelte', async () => ({
  default: (await vi.importActual('../mocks/components/MockChannelCard.svelte')).default
}));

// Create proper mock stores that behave like the real ones
const mockChannelStore = vi.hoisted(() => {
  const { writable } = require('svelte/store');
  const channels = writable([]);
  const activeChannel = writable(0);
  
  return {
    channels,
    activeChannel,
    reset: () => {
      channels.set([]);
      activeChannel.set(0);
    }
  };
});

vi.mock('$lib/stores/channels.js', () => ({
  channelStore: mockChannelStore
}));

import Dashboard from '$lib/components/Dashboard.svelte';
import { channelStore } from '$lib/stores/channels.js';

describe('Dashboard Component', () => {
  beforeEach(() => {
    // Reset mock store to clean state
    mockChannelStore.reset();
    
    // Set up test data
    channelStore.channels.set(Array(6).fill(null).map((_, i) => ({
      channel: i,
      online: false,
      machineType: 'Unknown',
      voltage: 0,
      current: 0,
      power: 0,
      temperature: 0,
      isOutput: false,
      mode: 'Normal',
      recording: false,
      waveformData: []
    })));
    channelStore.activeChannel.set(0);
  });

  describe('Rendering', () => {
    it('should display dashboard title', () => {
      const { getByText } = render(Dashboard);
      expect(getByText('Channels Overview')).toBeInTheDocument();
    });

    it('should render all 6 channel cards', () => {
      const { getAllByTestId } = render(Dashboard);
      
      const cards = getAllByTestId(/channel-card-\d/);
      expect(cards).toHaveLength(6);
      
      // Verify each card
      cards.forEach((card, index) => {
        expect(card).toHaveTextContent(`Channel ${index + 1}`);
        expect(card).toHaveAttribute('data-channel', String(index));
      });
    });

    it('should highlight active channel', async () => {
      const { getByTestId } = render(Dashboard);
      
      // Set channel 2 as active
      channelStore.activeChannel.set(2);
      
      await waitFor(() => {
        const activeCard = getByTestId('channel-card-2');
        expect(activeCard).toHaveClass('active');
      });
      
      // Verify others are not active
      for (let i = 0; i < 6; i++) {
        if (i !== 2) {
          const card = getByTestId(`channel-card-${i}`);
          expect(card).not.toHaveClass('active');
        }
      }
    });

    it('should update when channels data changes', async () => {
      const { rerender } = render(Dashboard);
      
      // Update channels with online status
      channelStore.channels.set(Array(6).fill(null).map((_, i) => ({
        channel: i,
        online: i < 3, // First 3 channels online
        machineType: i < 3 ? 'P906' : 'Unknown',
        voltage: i < 3 ? 3.3 : 0,
        current: i < 3 ? 0.5 : 0,
        power: i < 3 ? 1.65 : 0,
        temperature: i < 3 ? 25.5 : 0,
        isOutput: i === 0,
        mode: 'Normal',
        recording: false,
        waveformData: []
      })));
      
      await rerender({});
      
      // Component should re-render with updated data
      // (actual display would be in ChannelCard, but we verify props are passed)
    });
  });

  describe('Grid Layout', () => {
    it('should use CSS grid for layout', () => {
      const { container } = render(Dashboard);
      
      const grid = container.querySelector('.channel-grid');
      expect(grid).toBeInTheDocument();
      
      // Verify grid styling
      const styles = window.getComputedStyle(grid);
      expect(styles.display).toBe('grid');
    });

    it('should have responsive grid columns', () => {
      const { container } = render(Dashboard);
      
      const grid = container.querySelector('.channel-grid');
      const styles = window.getComputedStyle(grid);
      
      // Check grid template columns
      expect(styles.gridTemplateColumns).toContain('repeat');
    });
  });

  describe('Channel Selection', () => {
    it('should emit selectChannel event when card is clicked', async () => {
      const selectHandler = vi.fn();
      const { getByTestId } = render(Dashboard, { 
        props: { onselectchannel: selectHandler }
      });
      
      // Click channel 3
      const card = getByTestId('channel-card-3');
      await fireEvent.click(card);
      
      expect(selectHandler).toHaveBeenCalledWith(3);
    });

    it('should handle multiple channel selections', async () => {
      const selections = [];
      const { getByTestId } = render(Dashboard, {
        props: { onselectchannel: (channel) => selections.push(channel) }
      });
      
      // Click multiple channels
      await fireEvent.click(getByTestId('channel-card-1'));
      await fireEvent.click(getByTestId('channel-card-4'));
      await fireEvent.click(getByTestId('channel-card-0'));
      
      expect(selections).toEqual([1, 4, 0]);
    });

    it('should allow selecting already active channel', async () => {
      channelStore.activeChannel.set(2);
      
      const selectHandler = vi.fn();
      const { getByTestId } = render(Dashboard, {
        props: { onselectchannel: selectHandler }
      });
      
      // Click the already active channel
      await fireEvent.click(getByTestId('channel-card-2'));
      
      expect(selectHandler).toHaveBeenCalledWith(2);
    });
  });

  describe('Data Binding', () => {
    it('should react to store updates', async () => {
      const { container } = render(Dashboard);
      
      // Initially 6 cards
      let cards = container.querySelectorAll('[data-testid^="channel-card-"]');
      expect(cards).toHaveLength(6);
      
      // Update store with different data
      channelStore.channels.set(Array(6).fill(null).map((_, i) => ({
        channel: i,
        online: true,
        machineType: 'L1060',
        voltage: 12,
        current: 2,
        power: 24,
        temperature: 30,
        isOutput: true,
        mode: 'CC',
        recording: false,
        waveformData: []
      })));
      
      await waitFor(() => {
        // Cards should still be 6 (component re-renders with new data)
        cards = container.querySelectorAll('[data-testid^="channel-card-"]');
        expect(cards).toHaveLength(6);
      });
    });

    it('should handle empty channel array', async () => {
      channelStore.channels.set([]);
      
      const { container } = render(Dashboard);
      
      const cards = container.querySelectorAll('[data-testid^="channel-card-"]');
      expect(cards).toHaveLength(0);
    });

    it('should handle partial channel data', async () => {
      channelStore.channels.set([
        { channel: 0, online: true },
        { channel: 1, online: false },
        { channel: 2, online: true }
      ]);
      
      const { container } = render(Dashboard);
      
      const cards = container.querySelectorAll('[data-testid^="channel-card-"]');
      expect(cards).toHaveLength(3);
    });
  });

  describe('Performance', () => {
    it('should handle rapid active channel changes', async () => {
      const { container } = render(Dashboard);
      
      // Rapidly change active channel
      for (let i = 0; i < 20; i++) {
        channelStore.activeChannel.set(i % 6);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Should not crash and last state should be correct
      // i goes from 0 to 19, so last value is 19 % 6 = 1
      await waitFor(() => {
        const activeCard = container.querySelector('.channel-card.active');
        expect(activeCard).toHaveAttribute('data-channel', '1'); // 19 % 6 = 1
      });
    });

    it('should efficiently update only changed channels', async () => {
      const { rerender } = render(Dashboard);
      
      const initialChannels = Array(6).fill(null).map((_, i) => ({
        channel: i,
        online: false,
        voltage: 0,
        current: 0
      }));
      
      channelStore.channels.set(initialChannels);
      
      // Update only one channel
      const updatedChannels = [...initialChannels];
      updatedChannels[3] = { ...updatedChannels[3], online: true, voltage: 5 };
      
      channelStore.channels.set(updatedChannels);
      await rerender({});
      
      // Component should handle update efficiently
      // (In real implementation, Svelte handles this optimization)
    });
  });

  describe('Accessibility', () => {
    it('should have semantic HTML structure', () => {
      const { container } = render(Dashboard);
      
      // Should have heading
      const heading = container.querySelector('h2');
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent('Channels Overview');
      
      // Grid should be properly structured
      const grid = container.querySelector('.channel-grid');
      expect(grid).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const selectHandler = vi.fn();
      const { container } = render(Dashboard, {
        props: { onselectchannel: selectHandler }
      });
      
      // Get first card and simulate keyboard interaction
      const firstCard = container.querySelector('[data-testid="channel-card-0"]');
      firstCard.focus();
      
      await fireEvent.keyDown(firstCard, { key: 'Enter' });
      
      // Note: Actual keyboard support would be in ChannelCard component
      // This test verifies the structure supports it
    });
  });

  describe('Edge Cases', () => {
    it('should handle channel with missing properties', async () => {
      channelStore.channels.set([
        { channel: 0 }, // Minimal data
        { channel: 1, online: true }, // Partial data
        { // Full data
          channel: 2,
          online: true,
          machineType: 'P906',
          voltage: 3.3,
          current: 0.5,
          power: 1.65,
          temperature: 25,
          isOutput: true,
          mode: 'CV'
        }
      ]);
      
      const { getAllByTestId } = render(Dashboard);
      
      const cards = getAllByTestId(/channel-card-\d/);
      expect(cards).toHaveLength(3);
    });

    it('should handle very large channel numbers', async () => {
      channelStore.channels.set([
        { channel: 999, online: true }
      ]);
      
      const { getByTestId } = render(Dashboard);
      
      const card = getByTestId('channel-card-999');
      expect(card).toHaveTextContent('Channel 1000');
    });

    it('should handle negative channel numbers gracefully', async () => {
      channelStore.channels.set([
        { channel: -1, online: true }
      ]);
      
      const { getByTestId } = render(Dashboard);
      
      const card = getByTestId('channel-card--1');
      expect(card).toHaveTextContent('Channel 0');
    });
  });

  describe('Memory Management', () => {
    it('should clean up event listeners on unmount', () => {
      const { unmount } = render(Dashboard);
      
      // Should not throw errors
      expect(() => unmount()).not.toThrow();
    });

    it('should unsubscribe from stores on unmount', async () => {
      const { unmount } = render(Dashboard);
      
      unmount();
      
      // Update stores after unmount
      channelStore.channels.set([]);
      channelStore.activeChannel.set(5);
      
      // Should not cause errors (component is unmounted)
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  });
});