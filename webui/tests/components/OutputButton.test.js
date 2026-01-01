import { render, fireEvent, screen, waitFor } from '@testing-library/svelte';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import OutputButton from '../../src/lib/components/OutputButton.svelte';

const mockOnToggle = vi.hoisted(() => vi.fn());

describe('OutputButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockOnToggle.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Button Text Based on Device Type', () => {
    it('should display "Output" for PSU devices', () => {
      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle
        }
      });

      expect(screen.getByText('Output: OFF')).toBeInTheDocument();
    });

    it('should display "Input" for Load devices', () => {
      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'L1060 Load',
          onToggle: mockOnToggle
        }
      });

      expect(screen.getByText('Input: OFF')).toBeInTheDocument();
    });

    it('should display "Input" for shortened Load type', () => {
      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'L1060',
          onToggle: mockOnToggle
        }
      });

      expect(screen.getByText('Input: OFF')).toBeInTheDocument();
    });

    it('should default to "Output" for unknown device types', () => {
      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'Unknown',
          onToggle: mockOnToggle
        }
      });

      expect(screen.getByText('Output: OFF')).toBeInTheDocument();
    });
  });

  describe('State Display', () => {
    it('should show ON state when isOutput is true', () => {
      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: true,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle
        }
      });

      expect(screen.getByText('Output: ON')).toBeInTheDocument();
      expect(screen.getByRole('button')).toHaveClass('on');
    });

    it('should show OFF state when isOutput is false', () => {
      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle
        }
      });

      expect(screen.getByText('Output: OFF')).toBeInTheDocument();
      expect(screen.getByRole('button')).not.toHaveClass('on');
    });
  });

  describe('Size Variants', () => {
    it('should apply small class when size is small', () => {
      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle,
          size: 'small'
        }
      });

      expect(screen.getByRole('button')).toHaveClass('small');
    });

    it('should not apply small class when size is normal', () => {
      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle,
          size: 'normal'
        }
      });

      expect(screen.getByRole('button')).not.toHaveClass('small');
    });
  });

  describe('Optimistic State Updates', () => {
    it('should immediately show new state when clicked', async () => {
      mockOnToggle.mockResolvedValue();

      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle
        }
      });

      const button = screen.getByRole('button');
      expect(screen.getByText('Output: OFF')).toBeInTheDocument();

      // Click the button
      await fireEvent.pointerUp(button);

      // Should immediately show ON state (optimistic update)
      expect(screen.getByText('Output: ON')).toBeInTheDocument();
      expect(button).toHaveClass('on');
      expect(button).toHaveClass('waiting');
      expect(screen.getByRole('button')).toContainElement(screen.getByRole('button').querySelector('.spinner'));
    });

    it('should call channelStore.setOutput with correct parameters', async () => {
      mockOnToggle.mockResolvedValue();

      render(OutputButton, {
        props: {
          channel: 2,
          isOutput: false,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle
        }
      });

      await fireEvent.pointerUp(screen.getByRole('button'));

      expect(mockOnToggle).toHaveBeenCalledWith(2, true);
    });

    it('should toggle from ON to OFF state', async () => {
      mockOnToggle.mockResolvedValue();

      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: true,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle
        }
      });

      const button = screen.getByRole('button');
      expect(screen.getByText('Output: ON')).toBeInTheDocument();

      await fireEvent.pointerUp(button);

      expect(screen.getByText('Output: OFF')).toBeInTheDocument();
      expect(button).not.toHaveClass('on');
      expect(mockOnToggle).toHaveBeenCalledWith(0, false);
    });
  });

  describe('Timeout and Error Handling', () => {
    it('should revert to original state after 5 second timeout', async () => {
      // Mock a hanging promise (no acknowledgement)
      mockOnToggle.mockReturnValue(new Promise(() => {}));

      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle
        }
      });

      const button = screen.getByRole('button');
      
      // Click button - should show optimistic state
      await fireEvent.pointerUp(button);
      expect(screen.getByText('Output: ON')).toBeInTheDocument();
      expect(button).toHaveClass('waiting');

      // Fast-forward 5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      // Should revert to original state
      await waitFor(() => {
        expect(screen.getByText('Output: OFF')).toBeInTheDocument();
      });
      expect(button).not.toHaveClass('on');
      expect(button).not.toHaveClass('waiting');
    });

    it('should revert state immediately on setOutput error', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockOnToggle.mockRejectedValue(new Error('Communication failed'));

      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle
        }
      });

      const button = screen.getByRole('button');
      
      await fireEvent.pointerUp(button);

      // Should revert immediately after error
      await waitFor(() => {
        expect(screen.getByText('Output: OFF')).toBeInTheDocument();
      });
      expect(button).not.toHaveClass('on');
      expect(button).not.toHaveClass('waiting');
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('should clear optimistic state when actual state matches', async () => {
      mockOnToggle.mockResolvedValue();

      const { rerender } = render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle
        }
      });

      const button = screen.getByRole('button');
      
      // Click button
      await fireEvent.pointerUp(button);
      expect(button).toHaveClass('waiting');

      // Simulate device acknowledgement by re-rendering with new props
      await rerender({
        channel: 0,
        isOutput: true,
        machineType: 'P906 PSU',
        onToggle: mockOnToggle
      });

      // Should clear waiting state
      await waitFor(() => {
        expect(button).not.toHaveClass('waiting');
      });
      expect(screen.getByText('Output: ON')).toBeInTheDocument();
      expect(button).toHaveClass('on');
    });
  });

  describe('Disabled State', () => {
    it('should not respond to clicks when disabled', async () => {
      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle,
          disabled: true
        }
      });

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();

      await fireEvent.pointerUp(button);

      expect(mockOnToggle).not.toHaveBeenCalled();
      expect(screen.getByText('Output: OFF')).toBeInTheDocument();
    });

    it('should not respond to clicks while waiting for acknowledgement', async () => {
      mockOnToggle.mockReturnValue(new Promise(() => {}));

      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle
        }
      });

      const button = screen.getByRole('button');
      
      // First click
      await fireEvent.pointerUp(button);
      expect(mockOnToggle).toHaveBeenCalledTimes(1);
      expect(button).toHaveClass('waiting');

      // Second click should be ignored
      await fireEvent.pointerUp(button);
      expect(mockOnToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event Propagation', () => {
    it('should call setOutput when clicked', async () => {
      mockOnToggle.mockResolvedValue();

      render(OutputButton, {
        props: {
          channel: 0,
          isOutput: false,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle
        }
      });

      const button = screen.getByRole('button');
      await fireEvent.pointerUp(button);

      expect(mockOnToggle).toHaveBeenCalled();
    });
  });

  describe('Event Emission', () => {
    it('should successfully toggle without timing out', async () => {
      mockOnToggle.mockResolvedValue();

      render(OutputButton, {
        props: {
          channel: 2,
          isOutput: false,
          machineType: 'P906 PSU',
          onToggle: mockOnToggle
        }
      });

      await fireEvent.pointerUp(screen.getByRole('button'));

      expect(mockOnToggle).toHaveBeenCalledWith(2, true);
    });
  });
});
