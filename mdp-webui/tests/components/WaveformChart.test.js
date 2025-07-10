import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import WaveformChart from '../../src/lib/components/WaveformChart.svelte';

// Mock uPlot
vi.mock('uplot', () => {
  return {
    default: vi.fn().mockImplementation((options, data, container) => {
      return {
        options,
        data,
        container,
        setData: vi.fn(),
        setSize: vi.fn(),
        setScale: vi.fn(),
        destroy: vi.fn(),
        id: Math.random()
      };
    })
  };
});

// Import the mocked uPlot
import uPlot from 'uplot';

describe('WaveformChart Component', () => {
  let mockRequestAnimationFrame;
  let animationFrameCallbacks = [];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock requestAnimationFrame to control animation loop
    mockRequestAnimationFrame = vi.fn((callback) => {
      const id = animationFrameCallbacks.length;
      animationFrameCallbacks.push(callback);
      return id;
    });
    global.requestAnimationFrame = mockRequestAnimationFrame;
  });

  afterEach(() => {
    animationFrameCallbacks = [];
  });

  describe('Initial Rendering', () => {
    it('should display no data message when data is empty', () => {
      const { getByText } = render(WaveformChart, {
        props: { data: [], isRecording: false }
      });
      
      expect(getByText('No data recorded yet. Click "Start Recording" to begin.')).toBeInTheDocument();
    });

    it('should display waiting message when recording with no data', () => {
      const { getByText } = render(WaveformChart, {
        props: { data: [], isRecording: true }
      });
      
      expect(getByText('Waiting for data...')).toBeInTheDocument();
    });

    it('should create uPlot instance on mount', async () => {
      const { container } = render(WaveformChart, {
        props: { data: [], isRecording: false }
      });
      
      await waitFor(() => {
        expect(uPlot).toHaveBeenCalled();
      });
      
      const chartContainer = container.querySelector('.chart-container');
      expect(chartContainer).toBeInTheDocument();
    });
  });

  describe('Chart Configuration', () => {
    it('should configure chart with correct options', async () => {
      render(WaveformChart, {
        props: { data: [], isRecording: false }
      });
      
      await waitFor(() => {
        expect(uPlot).toHaveBeenCalled();
      });
      
      const callArgs = uPlot.mock.calls[0][0];
      
      expect(callArgs.title).toBe('Voltage & Current vs Time');
      expect(callArgs.series).toHaveLength(3); // Time, Voltage, Current
      expect(callArgs.axes).toHaveLength(3); // X, Y1, Y2
      
      // Check series configuration
      expect(callArgs.series[1].label).toBe('Voltage');
      expect(callArgs.series[1].stroke).toBe('#2196f3');
      expect(callArgs.series[2].label).toBe('Current');
      expect(callArgs.series[2].stroke).toBe('#ff5722');
      
      // Check axes configuration
      expect(callArgs.axes[1].label).toBe('Voltage (V)');
      expect(callArgs.axes[2].label).toBe('Current (A)');
      expect(callArgs.axes[2].side).toBe(1); // Right side
    });
  });

  describe('Data Updates', () => {
    it('should update chart when data changes', async () => {
      const { rerender } = render(WaveformChart, {
        props: { data: [], isRecording: false }
      });
      
      await waitFor(() => {
        expect(uPlot).toHaveBeenCalled();
      });
      
      const chartInstance = uPlot.mock.results[0].value;
      
      // Update with new data
      const newData = [
        { timestamp: 0, voltage: 3.3, current: 0.5 },
        { timestamp: 10, voltage: 3.4, current: 0.6 }
      ];
      
      await rerender({ data: newData, isRecording: false });
      
      expect(chartInstance.setData).toHaveBeenCalledWith([
        [0, 10],           // timestamps
        [3.3, 3.4],        // voltages
        [0.5, 0.6]         // currents
      ]);
    });

    it('should handle large datasets', async () => {
      const largeData = Array(1000).fill(null).map((_, i) => ({
        timestamp: i * 10,
        voltage: 3.3 + Math.sin(i / 100) * 0.1,
        current: 0.5 + Math.cos(i / 100) * 0.05
      }));
      
      const { rerender } = render(WaveformChart, {
        props: { data: [], isRecording: false }
      });
      
      await waitFor(() => {
        expect(uPlot).toHaveBeenCalled();
      });
      
      const chartInstance = uPlot.mock.results[0].value;
      
      await rerender({ data: largeData, isRecording: false });
      
      expect(chartInstance.setData).toHaveBeenCalled();
      const calledData = chartInstance.setData.mock.calls[0][0];
      expect(calledData[0]).toHaveLength(1000); // timestamps
      expect(calledData[1]).toHaveLength(1000); // voltages
      expect(calledData[2]).toHaveLength(1000); // currents
    });
  });

  describe('Live Recording Mode', () => {
    it('should start animation loop when recording', async () => {
      render(WaveformChart, {
        props: { data: [], isRecording: true }
      });
      
      await waitFor(() => {
        expect(mockRequestAnimationFrame).toHaveBeenCalled();
      });
    });

    it('should auto-scale during recording', async () => {
      const data = Array(200).fill(null).map((_, i) => ({
        timestamp: i * 50,
        voltage: 3.3,
        current: 0.5
      }));
      
      render(WaveformChart, {
        props: { data, isRecording: true }
      });
      
      await waitFor(() => {
        expect(uPlot).toHaveBeenCalled();
      });
      
      const chartInstance = uPlot.mock.results[0].value;
      
      // Trigger animation frame
      animationFrameCallbacks[0]();
      
      // Should set scale to show last 10 seconds
      expect(chartInstance.setScale).toHaveBeenCalledWith('x', {
        min: 0, // Since total time is less than 10s
        max: 9950 // Last timestamp
      });
    });

    it('should update chart continuously when recording', async () => {
      const initialData = [
        { timestamp: 0, voltage: 3.3, current: 0.5 }
      ];
      
      const { rerender } = render(WaveformChart, {
        props: { data: initialData, isRecording: true }
      });
      
      await waitFor(() => {
        expect(uPlot).toHaveBeenCalled();
      });
      
      const chartInstance = uPlot.mock.results[0].value;
      
      // Simulate multiple animation frames
      for (let i = 0; i < 5; i++) {
        animationFrameCallbacks[0]();
      }
      
      // Should have called setData multiple times
      expect(chartInstance.setData.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('Window Resizing', () => {
    it('should resize chart on window resize', async () => {
      const { container } = render(WaveformChart, {
        props: { data: [], isRecording: false }
      });
      
      await waitFor(() => {
        expect(uPlot).toHaveBeenCalled();
      });
      
      const chartInstance = uPlot.mock.results[0].value;
      
      // Mock container dimensions
      const chartContainer = container.querySelector('.chart-container');
      Object.defineProperty(chartContainer, 'getBoundingClientRect', {
        value: () => ({ width: 1200, height: 400 })
      });
      
      // Trigger resize
      window.dispatchEvent(new Event('resize'));
      
      expect(chartInstance.setSize).toHaveBeenCalledWith({
        width: 1200,
        height: 400
      });
    });
  });

  describe('Cleanup', () => {
    it('should destroy chart on unmount', async () => {
      const { unmount } = render(WaveformChart, {
        props: { data: [], isRecording: false }
      });
      
      await waitFor(() => {
        expect(uPlot).toHaveBeenCalled();
      });
      
      const chartInstance = uPlot.mock.results[0].value;
      
      unmount();
      
      expect(chartInstance.destroy).toHaveBeenCalled();
    });

    it('should cancel animation frame on unmount', async () => {
      const mockCancelAnimationFrame = vi.fn();
      global.cancelAnimationFrame = mockCancelAnimationFrame;
      
      const { unmount } = render(WaveformChart, {
        props: { data: [], isRecording: true }
      });
      
      await waitFor(() => {
        expect(mockRequestAnimationFrame).toHaveBeenCalled();
      });
      
      unmount();
      
      expect(mockCancelAnimationFrame).toHaveBeenCalled();
    });

    it('should remove resize listener on unmount', async () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      
      const { unmount } = render(WaveformChart, {
        props: { data: [], isRecording: false }
      });
      
      unmount();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });
  });

  describe('Edge Cases', () => {
    it('should handle data with NaN values', async () => {
      const badData = [
        { timestamp: 0, voltage: NaN, current: 0.5 },
        { timestamp: 10, voltage: 3.3, current: NaN },
        { timestamp: 20, voltage: 3.4, current: 0.6 }
      ];
      
      const { rerender } = render(WaveformChart, {
        props: { data: [], isRecording: false }
      });
      
      await waitFor(() => {
        expect(uPlot).toHaveBeenCalled();
      });
      
      const chartInstance = uPlot.mock.results[0].value;
      
      await rerender({ data: badData, isRecording: false });
      
      // Should still call setData (uPlot handles NaN)
      expect(chartInstance.setData).toHaveBeenCalled();
    });

    it('should handle very rapid data updates', async () => {
      const { rerender } = render(WaveformChart, {
        props: { data: [], isRecording: true }
      });
      
      await waitFor(() => {
        expect(uPlot).toHaveBeenCalled();
      });
      
      // Simulate rapid updates
      for (let i = 0; i < 100; i++) {
        const data = [{ timestamp: i, voltage: 3.3, current: 0.5 }];
        await rerender({ data, isRecording: true });
      }
      
      // Should not crash or throw errors
      expect(uPlot.mock.calls).toHaveLength(1); // Only one chart instance
    });

    it('should handle switching between recording states', async () => {
      const data = [
        { timestamp: 0, voltage: 3.3, current: 0.5 }
      ];
      
      const { rerender } = render(WaveformChart, {
        props: { data, isRecording: true }
      });
      
      await waitFor(() => {
        expect(mockRequestAnimationFrame).toHaveBeenCalled();
      });
      
      // Stop recording
      await rerender({ data, isRecording: false });
      
      // Start recording again
      await rerender({ data, isRecording: true });
      
      // Should handle state changes gracefully
      expect(mockRequestAnimationFrame.mock.calls.length).toBeGreaterThan(1);
    });
  });
});