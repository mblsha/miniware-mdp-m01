import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { writable, get } from 'svelte/store';
import ChannelDetail from '$lib/components/ChannelDetail.svelte';

// Mock URL and Blob for CSV export
global.URL.createObjectURL = vi.fn(() => 'mock-blob-url');
global.URL.revokeObjectURL = vi.fn();
global.Blob = vi.fn((content, options) => ({
  text: () => Promise.resolve(content[0]),
  type: options.type
}));

// Mock document.createElement for download
const mockClick = vi.fn();
const mockAnchor = {
  href: '',
  download: '',
  click: mockClick
};
const originalCreateElement = document.createElement.bind(document);
document.createElement = vi.fn((tag) => {
  if (tag === 'a') return mockAnchor;
  return originalCreateElement(tag);
});

// Mock WaveformChart
vi.mock('$lib/components/WaveformChart.svelte', async () => ({
  default: (await vi.importActual('../mocks/components/MockWaveformChart.svelte')).default
}));

// Mock the channel store
vi.mock('$lib/stores/channels.js', () => {
  const { writable } = require('svelte/store');
  const channels = writable([]);
  const activeChannel = writable(0);
  
  return {
    channelStore: {
      channels,
      activeChannel,
      setActiveChannel: vi.fn((ch) => activeChannel.set(ch)),
      startRecording: vi.fn((ch) => {
        channels.update(chs => {
          if (chs[ch]) {
            chs[ch].recording = true;
            chs[ch].waveformData = [];
          }
          return [...chs];
        });
      }),
      stopRecording: vi.fn((ch) => {
        channels.update(chs => {
          if (chs[ch]) {
            chs[ch].recording = false;
          }
          return [...chs];
        });
      }),
      setVoltage: vi.fn(),
      setCurrent: vi.fn(),
      setOutput: vi.fn()
    }
  };
});

import { channelStore } from '$lib/stores/channels.js';

describe('ChannelDetail Recording Tests', () => {
  let mockChannelData;
  const { channels, activeChannel } = channelStore;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Setup 6 channels with first one online
    mockChannelData = Array(6).fill(null).map((_, i) => ({
      channel: i,
      online: i === 0,
      machineType: 'P906',
      voltage: 5,
      current: 1,
      power: 5,
      temperature: 25.5,
      isOutput: true,
      mode: 'CV',
      targetVoltage: 5,
      targetCurrent: 1,
      recording: false,
      waveformData: []
    }));
    
    channels.set(mockChannelData);
    activeChannel.set(0);
    mockClick.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Recording Workflow', () => {
    it('should start and stop recording', async () => {
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      // Start recording
      await fireEvent.click(getByText('Start Recording'));
      
      expect(channelStore.startRecording).toHaveBeenCalledWith(0);
      
      // Update store to reflect recording state
      mockChannelData[0].recording = true;
      channels.set([...mockChannelData]);
      
      // Should show recording UI
      await waitFor(() => {
        expect(getByText('Stop Recording')).toBeInTheDocument();
        expect(getByText(/Recording\.\.\./)).toBeInTheDocument();
      });
      
      // Stop recording
      await fireEvent.click(getByText('Stop Recording'));
      
      expect(channelStore.stopRecording).toHaveBeenCalledWith(0);
    });

    it('should collect waveform data during recording', async () => {
      mockChannelData[0].recording = true;
      channels.set([...mockChannelData]);
      
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      // Simulate adding waveform data
      mockChannelData[0].waveformData = [
        { timestamp: 0, voltage: 5, current: 1 },
        { timestamp: 10, voltage: 5.1, current: 1.05 },
        { timestamp: 20, voltage: 5.2, current: 1.1 }
      ];
      channels.set([...mockChannelData]);
      
      // Stop recording
      await fireEvent.click(getByText('Stop Recording'));
      
      // Should show export button with data count
      expect(getByText('Export Data')).toBeInTheDocument();
      expect(getByText('3 points')).toBeInTheDocument();
    });

    it('should not show export button for empty recording', async () => {
      const { getByText, queryByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      // Start and immediately stop recording
      await fireEvent.click(getByText('Start Recording'));
      
      mockChannelData[0].recording = true;
      channels.set([...mockChannelData]);
      
      await fireEvent.click(getByText('Stop Recording'));
      
      mockChannelData[0].recording = false;
      channels.set([...mockChannelData]);
      
      // Should not show export button
      expect(queryByText('Export Data')).not.toBeInTheDocument();
    });
  });

  describe('CSV Export', () => {
    it('should export valid CSV format', async () => {
      // Set up channel with waveform data
      mockChannelData[0].waveformData = [
        { timestamp: 0, voltage: 5, current: 1 },
        { timestamp: 10, voltage: 5.1, current: 1.05 },
        { timestamp: 20, voltage: 5.2, current: 1.1 }
      ];
      channels.set([...mockChannelData]);
      
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      await fireEvent.click(getByText('Export Data'));
      
      // Verify CSV content
      expect(global.Blob).toHaveBeenCalled();
      const blobContent = global.Blob.mock.calls[0][0][0];
      const lines = blobContent.split('\n');
      
      expect(lines[0]).toBe('Timestamp (ms),Voltage (V),Current (A)');
      expect(lines[1]).toBe('0,5,1');
      expect(lines[2]).toBe('10,5.1,1.05');
      expect(lines[3]).toBe('20,5.2,1.1');
      
      // Verify download
      expect(mockAnchor.download).toMatch(/channel_1_waveform_.*\.csv/);
      expect(mockClick).toHaveBeenCalled();
    });

    it('should handle large datasets efficiently', async () => {
      // Create 1000 data points
      const largeData = Array(1000).fill(null).map((_, i) => ({
        timestamp: i * 10,
        voltage: 5 + Math.sin(i / 100) * 0.1,
        current: 1 + Math.cos(i / 100) * 0.05
      }));
      
      mockChannelData[0].waveformData = largeData;
      channels.set([...mockChannelData]);
      
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      expect(getByText('1000 points')).toBeInTheDocument();
      
      await fireEvent.click(getByText('Export Data'));
      
      expect(global.Blob).toHaveBeenCalled();
      const blobContent = global.Blob.mock.calls[0][0][0];
      const lines = blobContent.split('\n');
      
      // Should have header + 1000 data lines
      expect(lines.length).toBe(1001);
    });
  });

  describe('Multi-channel Recording', () => {
    it('should handle independent recording states', async () => {
      // Make channel 1 also online
      mockChannelData[1].online = true;
      channels.set([...mockChannelData]);
      
      // Start recording on channel 0
      const { getByText, rerender } = render(ChannelDetail, { props: { channel: 0 } });
      await fireEvent.click(getByText('Start Recording'));
      
      mockChannelData[0].recording = true;
      channels.set([...mockChannelData]);
      
      // Switch to channel 1
      await rerender({ channel: 1 });
      
      // Channel 1 should not be recording
      expect(getByText('Start Recording')).toBeInTheDocument();
      
      // Start recording on channel 1
      await fireEvent.click(getByText('Start Recording'));
      
      mockChannelData[1].recording = true;
      channels.set([...mockChannelData]);
      
      // Switch back to channel 0
      await rerender({ channel: 0 });
      
      // Channel 0 should still be recording
      expect(getByText('Stop Recording')).toBeInTheDocument();
    });

    it('should maintain separate waveform data', async () => {
      // Set up two channels with different data
      mockChannelData[0].waveformData = [
        { timestamp: 0, voltage: 5, current: 1 }
      ];
      mockChannelData[1].online = true;
      mockChannelData[1].waveformData = [
        { timestamp: 0, voltage: 3.3, current: 0.5 }
      ];
      channels.set([...mockChannelData]);
      
      const { getByText, rerender } = render(ChannelDetail, { props: { channel: 0 } });
      
      // Channel 0 should show its data
      expect(getByText('1 points')).toBeInTheDocument();
      
      // Switch to channel 1
      await rerender({ channel: 1 });
      
      // Channel 1 should show its own data
      expect(getByText('1 points')).toBeInTheDocument();
      
      // Export channel 1 data
      await fireEvent.click(getByText('Export Data'));
      
      const blobContent = global.Blob.mock.calls[0][0][0];
      expect(blobContent).toContain('0,3.3,0.5');
    });
  });
});