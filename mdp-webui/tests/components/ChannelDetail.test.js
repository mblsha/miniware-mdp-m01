import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';

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

// Mock WaveformChart BEFORE other imports
vi.mock('$lib/components/WaveformChart.svelte', async () => ({
  default: (await vi.importActual('../mocks/components/MockWaveformChart.svelte')).default
}));

vi.mock('$lib/stores/channels.js', () => ({
  channelStore: {
    channels: writable([]),
    activeChannel: writable(0),
    setActiveChannel: vi.fn(),
    setVoltage: vi.fn(),
    setCurrent: vi.fn(),
    setOutput: vi.fn(),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    clearRecording: vi.fn()
  }
}));

// Import component after mocks
import { channelStore } from '$lib/stores/channels.js';
import ChannelDetail from '$lib/components/ChannelDetail.svelte';

describe('ChannelDetail Component', () => {
  let mockChannelData;
  const { set: setMockChannels } = channelStore.channels;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Setup default channel data
    mockChannelData = Array(6).fill(null).map((_, i) => ({
      channel: i,
      online: i === 0,
      machineType: 'P906',
      voltage: 3.3,
      current: 0.5,
      power: 1.65,
      temperature: 25.5,
      isOutput: true,
      mode: 'CV',
      targetVoltage: 3.3,
      targetCurrent: 0.5,
      recording: false,
      waveformData: []
    }));
    
    setMockChannels(mockChannelData);
    channelStore.activeChannel.set(0);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Header and Navigation', () => {
    it('should display channel number and machine type', () => {
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      expect(getByText('Channel 1 - P906')).toBeInTheDocument();
      expect(getByText('← Back')).toBeInTheDocument();
    });

    it('should call onback prop when back button clicked', async () => {
      const backHandler = vi.fn();
      const { getByText } = render(ChannelDetail, { props: { channel: 0, onback: backHandler } });
      
      await fireEvent.click(getByText('← Back'));
      
      expect(backHandler).toHaveBeenCalled();
    });

    it('should display offline message for offline channel', () => {
      mockChannelData[2].online = false;
      setMockChannels(mockChannelData);
      
      const { getByText } = render(ChannelDetail, { props: { channel: 2 } });
      
      expect(getByText('Channel 3 is offline')).toBeInTheDocument();
    });
  });

  describe('Output Control', () => {
    it('should display output status', () => {
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      const button = getByText('Output: ON');
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('on');
    });

    it('should toggle output when clicked', async () => {
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      await fireEvent.click(getByText('Output: ON'));
      
      expect(channelStore.setOutput).toHaveBeenCalledWith(0, false);
    });

    it('should handle output off state', () => {
      mockChannelData[0].isOutput = false;
      setMockChannels(mockChannelData);
      
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      const button = getByText('Output: OFF');
      expect(button).not.toHaveClass('on');
    });
  });

  describe('Parameter Configuration', () => {
    it('should display voltage and current inputs', () => {
      const { getByLabelText } = render(ChannelDetail, { props: { channel: 0 } });
      
      const voltageInput = getByLabelText(/Voltage \(V\)/);
      const currentInput = getByLabelText(/Current \(A\)/);
      
      expect(voltageInput).toHaveValue(3.3);
      expect(currentInput).toHaveValue(0.5);
    });

    it('should set voltage when Set V clicked', async () => {
      const { getByLabelText, getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      const voltageInput = getByLabelText(/Voltage \(V\)/);
      await fireEvent.input(voltageInput, { target: { value: '5' } });
      
      await fireEvent.click(getByText('Set V'));
      
      expect(channelStore.setVoltage).toHaveBeenCalledWith(0, 5, 0.5);
    });

    it('should set current when Set I clicked', async () => {
      const { getByLabelText, getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      const currentInput = getByLabelText(/Current \(A\)/);
      await fireEvent.input(currentInput, { target: { value: '1.5' } });
      
      await fireEvent.click(getByText('Set I'));
      
      expect(channelStore.setCurrent).toHaveBeenCalledWith(0, 3.3, 1.5);
    });

    it('should validate input ranges', () => {
      const { getByLabelText } = render(ChannelDetail, { props: { channel: 0 } });
      
      const voltageInput = getByLabelText(/Voltage \(V\)/);
      const currentInput = getByLabelText(/Current \(A\)/);
      
      expect(voltageInput).toHaveAttribute('min', '0');
      expect(voltageInput).toHaveAttribute('max', '30');
      expect(voltageInput).toHaveAttribute('step', '0.001');
      
      expect(currentInput).toHaveAttribute('min', '0');
      expect(currentInput).toHaveAttribute('max', '5');
      expect(currentInput).toHaveAttribute('step', '0.001');
    });

    it('should handle decimal inputs', async () => {
      const { getByLabelText, getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      const voltageInput = getByLabelText(/Voltage \(V\)/);
      await fireEvent.input(voltageInput, { target: { value: '12.345' } });
      
      await fireEvent.click(getByText('Set V'));
      
      expect(channelStore.setVoltage).toHaveBeenCalledWith(0, 12.345, 0.5);
    });
  });

  describe('Current Measurements Display', () => {
    it('should display all measurements', () => {
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      expect(getByText('3.300 V')).toBeInTheDocument();
      expect(getByText('0.500 A')).toBeInTheDocument();
      expect(getByText('1.650 W')).toBeInTheDocument();
      expect(getByText('25.5 °C')).toBeInTheDocument();
    });

    it('should update when channel data changes', async () => {
      const { getByText, rerender } = render(ChannelDetail, { props: { channel: 0 } });
      
      // Update channel data
      mockChannelData[0].voltage = 5.123;
      mockChannelData[0].current = 1.234;
      mockChannelData[0].power = 6.322;
      mockChannelData[0].temperature = 30.7;
      setMockChannels([...mockChannelData]);
      
      await rerender({ channel: 0 });
      
      expect(getByText('5.123 V')).toBeInTheDocument();
      expect(getByText('1.234 A')).toBeInTheDocument();
      expect(getByText('6.322 W')).toBeInTheDocument();
      expect(getByText('30.7 °C')).toBeInTheDocument();
    });
  });

  describe('Recording Functionality', () => {
    it('should show start recording button when not recording', () => {
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      expect(getByText('Start Recording')).toBeInTheDocument();
    });

    it('should start recording when button clicked', async () => {
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      await fireEvent.click(getByText('Start Recording'));
      
      expect(channelStore.startRecording).toHaveBeenCalledWith(0);
    });

    it('should show stop button and timer when recording', async () => {
      mockChannelData[0].recording = true;
      setMockChannels(mockChannelData);
      
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      expect(getByText('Stop Recording')).toBeInTheDocument();
      expect(getByText('Recording... 0:00')).toBeInTheDocument();
    });

    it('should update timer during recording', async () => {
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      // Start recording by clicking the button
      await fireEvent.click(getByText('Start Recording'));
      
      // Update the store to reflect recording state
      mockChannelData[0].recording = true;
      setMockChannels([...mockChannelData]);
      
      // Advance timer by 65 seconds
      await vi.advanceTimersByTimeAsync(65000);
      
      await waitFor(() => {
        expect(getByText('Recording... 1:05')).toBeInTheDocument();
      });
    });

    it('should stop recording when stop clicked', async () => {
      mockChannelData[0].recording = true;
      setMockChannels(mockChannelData);
      
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      await fireEvent.click(getByText('Stop Recording'));
      
      expect(channelStore.stopRecording).toHaveBeenCalledWith(0);
    });

    it('should show export button when data available', () => {
      mockChannelData[0].waveformData = [
        { timestamp: 0, voltage: 3.3, current: 0.5 },
        { timestamp: 10, voltage: 3.4, current: 0.6 }
      ];
      setMockChannels(mockChannelData);
      
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      expect(getByText('Export Data')).toBeInTheDocument();
      expect(getByText('2 points')).toBeInTheDocument();
    });
  });

  describe('Data Export', () => {
    it('should export CSV file with correct format', async () => {
      mockChannelData[0].waveformData = [
        { timestamp: 0, voltage: 3.3, current: 0.5 },
        { timestamp: 10, voltage: 3.4, current: 0.6 },
        { timestamp: 20, voltage: 3.5, current: 0.7 }
      ];
      setMockChannels(mockChannelData);
      
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      await fireEvent.click(getByText('Export Data'));
      
      // Verify Blob creation
      expect(global.Blob).toHaveBeenCalled();
      const blobContent = global.Blob.mock.calls[0][0][0];
      const lines = blobContent.split('\n');
      
      expect(lines[0]).toBe('Timestamp (ms),Voltage (V),Current (A)');
      expect(lines[1]).toBe('0,3.3,0.5');
      expect(lines[2]).toBe('10,3.4,0.6');
      expect(lines[3]).toBe('20,3.5,0.7');
      
      // Verify download
      expect(mockAnchor.download).toMatch(/channel_1_waveform_.*\.csv/);
      expect(mockClick).toHaveBeenCalled();
    });

    it('should not show export for empty data', () => {
      const { queryByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      expect(queryByText('Export Data')).not.toBeInTheDocument();
    });

    it('should handle large datasets', async () => {
      // Create 1000 data points
      const largeData = Array(1000).fill(null).map((_, i) => ({
        timestamp: i * 10,
        voltage: 3.3 + Math.sin(i / 100) * 0.1,
        current: 0.5 + Math.cos(i / 100) * 0.05
      }));
      
      mockChannelData[0].waveformData = largeData;
      setMockChannels(mockChannelData);
      
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      expect(getByText('1000 points')).toBeInTheDocument();
      
      await fireEvent.click(getByText('Export Data'));
      
      expect(global.Blob).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
    });
  });

  describe('Component Lifecycle', () => {
    it('should set active channel on mount', () => {
      render(ChannelDetail, { props: { channel: 3 } });
      
      expect(channelStore.setActiveChannel).toHaveBeenCalledWith(3);
    });

    it('should initialize target values from channel data', () => {
      mockChannelData[2] = {
        ...mockChannelData[2],
        online: true,
        voltage: 12,
        current: 2,
        targetVoltage: 0,
        targetCurrent: 0
      };
      setMockChannels(mockChannelData);
      
      const { getByLabelText } = render(ChannelDetail, { props: { channel: 2 } });
      
      // Should use actual values when targets are 0
      expect(getByLabelText(/Voltage \(V\)/)).toHaveValue(12);
      expect(getByLabelText(/Current \(A\)/)).toHaveValue(2);
    });

    it('should clean up timer on unmount', async () => {
      mockChannelData[0].recording = true;
      setMockChannels(mockChannelData);
      
      const { unmount } = render(ChannelDetail, { props: { channel: 0 } });
      
      // Start timer
      vi.advanceTimersByTime(1000);
      
      unmount();
      
      // Timer should be cleared
      vi.advanceTimersByTime(5000);
      // No errors should occur
    });
  });

  describe('Machine Type Specific Features', () => {
    it('should handle P905 machine type', () => {
      mockChannelData[0].machineType = 'P905';
      setMockChannels(mockChannelData);
      
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      expect(getByText('Channel 1 - P905')).toBeInTheDocument();
    });

    it('should handle L1060 machine type', () => {
      mockChannelData[0].machineType = 'L1060';
      mockChannelData[0].mode = 'CC';
      setMockChannels(mockChannelData);
      
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      expect(getByText('Channel 1 - L1060')).toBeInTheDocument();
      // Future: Add mode selection UI for L1060
    });

    it('should handle unknown machine type', () => {
      mockChannelData[0].machineType = 'Unknown';
      setMockChannels(mockChannelData);
      
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      expect(getByText('Channel 1 - Unknown')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle channel index out of bounds', () => {
      const { getByText } = render(ChannelDetail, { props: { channel: 10 } });
      
      expect(getByText('Channel 11 is offline')).toBeInTheDocument();
    });

    it('should handle negative channel index', () => {
      const { getByText } = render(ChannelDetail, { props: { channel: -1 } });
      
      expect(getByText('Channel 0 is offline')).toBeInTheDocument();
    });

    it('should handle very long recording sessions', async () => {
      const { getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      // Start recording by clicking the button
      await fireEvent.click(getByText('Start Recording'));
      
      // Update the store to reflect recording state
      mockChannelData[0].recording = true;
      setMockChannels([...mockChannelData]);
      
      // Advance by 1 hour in smaller chunks to avoid timeout
      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(60000); // 1 minute at a time
      }
      
      await waitFor(() => {
        expect(getByText('Recording... 60:00')).toBeInTheDocument();
      });
    });

    it('should handle rapid parameter changes', async () => {
      const { getByLabelText, getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      const voltageInput = getByLabelText(/Voltage \(V\)/);
      
      // Rapid changes
      for (let i = 0; i < 10; i++) {
        await fireEvent.input(voltageInput, { target: { value: String(i) } });
        await fireEvent.click(getByText('Set V'));
      }
      
      expect(channelStore.setVoltage).toHaveBeenCalledTimes(10);
    });

    it('should handle NaN or invalid inputs gracefully', async () => {
      const { getByLabelText, getByText } = render(ChannelDetail, { props: { channel: 0 } });
      
      const voltageInput = getByLabelText(/Voltage \(V\)/);
      await fireEvent.input(voltageInput, { target: { value: 'abc' } });
      
      await fireEvent.click(getByText('Set V'));
      
      // When input is invalid, the number input returns null for invalid values
      // The component passes channel (0), targetVoltage (null), targetCurrent (0.5)
      expect(channelStore.setVoltage).toHaveBeenCalledWith(0, null, 0.5);
    });
  });

  describe('Accessibility', () => {
    it('should have proper labels for inputs', () => {
      const { getByLabelText } = render(ChannelDetail, { props: { channel: 0 } });
      
      expect(getByLabelText(/Voltage \(V\)/)).toBeInTheDocument();
      expect(getByLabelText(/Current \(A\)/)).toBeInTheDocument();
    });

    it('should have semantic headings', () => {
      const { container } = render(ChannelDetail, { props: { channel: 0 } });
      
      const headings = container.querySelectorAll('h2, h3');
      expect(headings.length).toBeGreaterThan(0);
    });
  });
});