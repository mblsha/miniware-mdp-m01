import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import App from '../../src/App.svelte';
import { createMockSerial, MockSerialPort } from '../mocks/serial-api.js';
import { 
  createMachinePacket, 
  createSynthesizePacket, 
  createWavePacket,
  createUpdateChannelPacket 
} from '../mocks/packet-data.js';

// Mock URL.createObjectURL for file export
global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock document.createElement for download link
const mockClick = vi.fn();
const mockAnchor = {
  href: '',
  download: '',
  click: mockClick
};
// Save original and mock
const originalCreateElement = document.createElement;
document.createElement = vi.fn(tag => {
  if (tag === 'a') return mockAnchor;
  return originalCreateElement.call(document, tag);
});

describe('Recording Flow Integration Test', () => {
  let mockSerial;
  let mockPort;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSerial = createMockSerial();
    global.navigator.serial = mockSerial;
    mockPort = new MockSerialPort();
    mockClick.mockClear();
  });

  async function connectDevice({ getByText }) {
    // Click connect button
    const connectButton = getByText('Connect');
    await fireEvent.click(connectButton);
    
    // Simulate port selection
    mockSerial.setNextPort(mockPort);
    
    // Wait for connection
    await waitFor(() => {
      expect(getByText('Connected')).toBeInTheDocument();
    });
  }

  async function navigateToChannel({ getByText }, channelNum) {
    // Wait for dashboard to load
    await waitFor(() => {
      expect(getByText(`Channel ${channelNum}`)).toBeInTheDocument();
    });
    
    // Click on channel card
    const channelCard = getByText(`Channel ${channelNum}`).closest('.channel-card');
    await fireEvent.click(channelCard);
    
    // Wait for detail view
    await waitFor(() => {
      expect(getByText('← Back')).toBeInTheDocument();
    });
  }

  it('should complete full recording workflow', async () => {
    const renderResult = render(App);
    const { container, getByText } = renderResult;
    
    // Step 1: Connect to device
    await connectDevice(renderResult);
    
    // Step 2: Simulate device identification
    mockPort.simulateData(createMachinePacket(0x10)); // M01 device
    
    await waitFor(() => {
      expect(getByText('(M01)')).toBeInTheDocument();
    });
    
    // Step 3: Simulate initial channel data
    const channelData = [
      { online: 1, machineType: 0, voltage: 5000, current: 1000, temperature: 255, isOutput: 1 },
      { online: 1, machineType: 1, voltage: 3300, current: 500, temperature: 200, isOutput: 0 },
      { online: 0 }, // Offline channels
      { online: 0 },
      { online: 0 },
      { online: 0 }
    ];
    mockPort.simulateData(createSynthesizePacket(channelData));
    
    // Step 4: Navigate to channel 1
    await navigateToChannel(renderResult, 1);
    
    // Verify channel details are displayed
    expect(getByText('5.000 V')).toBeInTheDocument();
    expect(getByText('1.000 A')).toBeInTheDocument();
    expect(getByText('5.000 W')).toBeInTheDocument();
    expect(getByText('25.5 °C')).toBeInTheDocument();
    
    // Step 5: Start recording
    const startButton = getByText('Start Recording');
    await fireEvent.click(startButton);
    
    // Verify recording started
    await waitFor(() => {
      expect(getByText('Stop Recording')).toBeInTheDocument();
      expect(getByText(/Recording\.\.\./)).toBeInTheDocument();
    });
    
    // Step 6: Simulate wave data packets
    const waveData1 = Array(20).fill(null).map((_, i) => ({
      voltage: 5000 + i * 10,
      current: 1000 + i * 5
    }));
    
    mockPort.simulateData(createWavePacket(0, waveData1));
    
    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Send more wave data
    const waveData2 = Array(20).fill(null).map((_, i) => ({
      voltage: 5200 + i * 10,
      current: 1100 + i * 5
    }));
    
    mockPort.simulateData(createWavePacket(0, waveData2));
    
    // Step 7: Stop recording
    const stopButton = getByText('Stop Recording');
    await fireEvent.click(stopButton);
    
    // Verify recording stopped
    await waitFor(() => {
      expect(getByText('Start Recording')).toBeInTheDocument();
      expect(queryByText(/Recording\.\.\./)).not.toBeInTheDocument();
    });
    
    // Verify data points were captured
    expect(getByText(/40 points/)).toBeInTheDocument();
    
    // Step 8: Export data
    const exportButton = getByText('Export Data');
    await fireEvent.click(exportButton);
    
    // Verify export was triggered
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(mockAnchor.download).toMatch(/channel_1_waveform_.*\.csv/);
    expect(mockClick).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    
    // Verify CSV content
    const blobCall = global.URL.createObjectURL.mock.calls[0][0];
    expect(blobCall).toBeInstanceOf(Blob);
    expect(blobCall.type).toBe('text/csv');
  });

  it('should handle channel switching during recording', async () => {
    const renderResult = render(App);
    const { container, getByText, queryByText } = renderResult;
    
    await connectDevice(renderResult);
    mockPort.simulateData(createMachinePacket(0x10));
    
    // Send synthesize for multiple channels
    const channelData = [
      { online: 1, machineType: 0, voltage: 5000, current: 1000 },
      { online: 1, machineType: 1, voltage: 3300, current: 500 },
      { online: 1, machineType: 2, voltage: 0, current: 2000 }
    ];
    mockPort.simulateData(createSynthesizePacket(channelData));
    
    // Start recording on channel 1
    await navigateToChannel(renderResult, 1);
    await fireEvent.click(getByText('Start Recording'));
    
    // Send wave data for channel 0
    mockPort.simulateData(createWavePacket(0, [
      { voltage: 5000, current: 1000 }
    ]));
    
    // Go back to dashboard
    await fireEvent.click(getByText('← Back'));
    
    // Navigate to channel 2
    await navigateToChannel(renderResult, 2);
    
    // Verify channel 2 is not recording
    expect(getByText('Start Recording')).toBeInTheDocument();
    
    // Start recording on channel 2
    await fireEvent.click(getByText('Start Recording'));
    
    // Send wave data for channel 1
    mockPort.simulateData(createWavePacket(1, [
      { voltage: 3300, current: 500 }
    ]));
    
    // Verify both channels have independent recording state
    await fireEvent.click(getByText('← Back'));
    await navigateToChannel(renderResult, 1);
    
    expect(getByText('Stop Recording')).toBeInTheDocument();
  });

  it('should handle errors during recording', async () => {
    const renderResult = render(App);
    const { container, getByText, queryByText } = renderResult;
    
    await connectDevice(container);
    mockPort.simulateData(createMachinePacket(0x10));
    mockPort.simulateData(createSynthesizePacket([
      { online: 1, machineType: 0, voltage: 5000, current: 1000 }
    ]));
    
    await navigateToChannel(renderResult, 1);
    await fireEvent.click(getByText('Start Recording'));
    
    // Simulate disconnection during recording
    mockPort.simulateDisconnect();
    
    await waitFor(() => {
      expect(getByText('Error:')).toBeInTheDocument();
    });
    
    // Verify can reconnect and resume
    await fireEvent.click(getByText('Retry'));
    
    const newPort = new MockSerialPort();
    mockSerial.setNextPort(newPort);
    
    await waitFor(() => {
      expect(getByText('Connected')).toBeInTheDocument();
    });
  });

  it('should export valid CSV format', async () => {
    const renderResult = render(App);
    const { container, getByText, queryByText } = renderResult;
    
    await connectDevice(container);
    mockPort.simulateData(createMachinePacket(0x10));
    mockPort.simulateData(createSynthesizePacket([
      { online: 1, machineType: 0, voltage: 5000, current: 1000 }
    ]));
    
    await navigateToChannel(renderResult, 1);
    await fireEvent.click(getByText('Start Recording'));
    
    // Send specific wave data
    mockPort.simulateData(createWavePacket(0, [
      { voltage: 5000, current: 1000 },
      { voltage: 5100, current: 1050 }
    ]));
    
    await fireEvent.click(getByText('Stop Recording'));
    await fireEvent.click(getByText('Export Data'));
    
    // Get the blob content
    const blob = global.URL.createObjectURL.mock.calls[0][0];
    const text = await blob.text();
    
    // Verify CSV format
    const lines = text.split('\n');
    expect(lines[0]).toBe('Timestamp (ms),Voltage (V),Current (A)');
    expect(lines[1]).toBe('0,5,1');
    expect(lines[2]).toBe('10,5.1,1.05');
  });

  it('should handle empty recording export', async () => {
    const renderResult = render(App);
    const { container, getByText, queryByText } = renderResult;
    
    await connectDevice(container);
    mockPort.simulateData(createMachinePacket(0x10));
    mockPort.simulateData(createSynthesizePacket([
      { online: 1, machineType: 0, voltage: 5000, current: 1000 }
    ]));
    
    await navigateToChannel(renderResult, 1);
    
    // Start and immediately stop recording
    await fireEvent.click(getByText('Start Recording'));
    await fireEvent.click(getByText('Stop Recording'));
    
    // Export button should not be visible with 0 points
    expect(queryByText('Export Data')).not.toBeInTheDocument();
  });

  it('should update active channel from device', async () => {
    const { container } = render(App);
    
    await connectDevice(container);
    mockPort.simulateData(createMachinePacket(0x10));
    mockPort.simulateData(createSynthesizePacket([
      { online: 1, machineType: 0 },
      { online: 1, machineType: 1 },
      { online: 1, machineType: 2 }
    ]));
    
    // Simulate device changing active channel
    mockPort.simulateData(createUpdateChannelPacket(2));
    
    // Verify UI reflects the change
    await waitFor(() => {
      const channelCards = container.getAllByText(/Channel \d/).map(el => 
        el.closest('.channel-card')
      );
      expect(channelCards[2]).toHaveClass('active');
    });
  });
});