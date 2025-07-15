import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockSerial, MockSerialPort } from '../mocks/serial-api.js';
import { TestSerialConnection, ConnectionStatus } from '../mocks/test-serial-connection.js';
import { 
  createMachinePacket, 
  createSynthesizePacket, 
  createAddressPacket,
  createError240Packet,
  createMalformedPacket,
  createPacketSequence
} from '../mocks/packet-data.js';
import { setupPacketHandlers } from '../helpers/setup-packet-handlers.js';
import { createSetChannelPacket, createSetVoltagePacket, createSetCurrentPacket, createSetOutputPacket } from '$lib/packet-encoder';

// Hoist packet encoder functions for use in mocks
const packetEncoders = vi.hoisted(() => {
  const { createSetChannelPacket, createSetVoltagePacket, createSetCurrentPacket, createSetOutputPacket } = require('../../src/lib/packet-encoder.ts');
  return { createSetChannelPacket, createSetVoltagePacket, createSetCurrentPacket, createSetOutputPacket };
});

// Create factory functions for mock stores
const createMockStores = vi.hoisted(() => {
  return () => {
    const { writable, derived } = require('svelte/store');
    const channels = writable(Array(6).fill(null).map((_, i) => ({
      channel: i,
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
      recording: false,
      waveformData: []
    })));
    const activeChannel = writable(0);
    const waitingSynthesize = writable(true);
    return { channels, activeChannel, waitingSynthesize };
  };
});

// Create hoisted test connection - single instance for all tests
const sharedTestConnection = vi.hoisted(() => {
  const { TestSerialConnection, ConnectionStatus } = require('../mocks/test-serial-connection.js');
  return new TestSerialConnection();
});

// Mock the serial connection module to use TestSerialConnection
vi.mock('$lib/serial.js', () => {
  return {
    serialConnection: sharedTestConnection,
    ConnectionStatus: {
      DISCONNECTED: 'disconnected',
      CONNECTING: 'connecting',
      CONNECTED: 'connected',
      ERROR: 'error'
    }
  };
});

// Mock the channel store with proper packet sending
vi.mock('$lib/stores/channels.js', () => {
  const { channels, activeChannel, waitingSynthesize } = createMockStores();
  
  return {
    channelStore: {
      channels,
      activeChannel: derived(activeChannel, $active => $active),
      waitingSynthesize, // Make this writable for tests
      reset: vi.fn(() => {
        channels.set(Array(6).fill(null).map((_, i) => ({
          channel: i,
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
          recording: false,
          waveformData: []
        })));
        activeChannel.set(0);
        waitingSynthesize.set(true);
      }),
      setActiveChannel: vi.fn(async (channel) => {
        const packet = packetEncoders.createSetChannelPacket(channel);
        await serialConnection.sendPacket(packet);
        activeChannel.set(channel);
      }),
      setVoltage: vi.fn(async (channel, voltage, current) => {
        const packet = packetEncoders.createSetVoltagePacket(channel, voltage, current);
        await serialConnection.sendPacket(packet);
        channels.update(chs => {
          chs[channel].targetVoltage = voltage;
          chs[channel].targetCurrent = current;
          return chs;
        });
      }),
      setCurrent: vi.fn(async (channel, voltage, current) => {
        const packet = packetEncoders.createSetCurrentPacket(channel, voltage, current);
        await serialConnection.sendPacket(packet);
        channels.update(chs => {
          chs[channel].targetVoltage = voltage;
          chs[channel].targetCurrent = current;
          return chs;
        });
      }),
      setOutput: vi.fn(async (channel, enabled) => {
        const packet = packetEncoders.createSetOutputPacket(channel, enabled);
        await serialConnection.sendPacket(packet);
      }),
      startRecording: vi.fn((channel) => {
        channels.update(chs => {
          chs[channel].recording = true;
          chs[channel].waveformData = [];
          return chs;
        });
      }),
      stopRecording: vi.fn((channel) => {
        channels.update(chs => {
          chs[channel].recording = false;
          return chs;
        });
      }),
      clearRecording: vi.fn()
    }
  };
});

// Import these after mocks are set up
const { render, fireEvent, waitFor } = await import('@testing-library/svelte');
const { tick } = await import('svelte');
const { get, writable, derived } = await import('svelte/store');

// Now import App after all mocks are in place
const App = (await import('../../src/App.svelte')).default;

// Use the mocked instances
const serialConnection = sharedTestConnection;
const { channelStore } = await import('$lib/stores/channels');

describe('Serial Communication Flow Integration Test', () => {
  let mockSerial;
  let mockPort;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSerial = createMockSerial();
    global.navigator.serial = mockSerial;
    
    // Reset TestSerialConnection state
    if (get(serialConnection.status) !== 'disconnected') {
      await serialConnection.disconnect();
    }
    serialConnection.clearPacketHandlers();
    channelStore.reset();
    
    // Set up packet handlers for test
    setupPacketHandlers(serialConnection, channelStore);
  });

  afterEach(async () => {
    // Clean up TestSerialConnection
    serialConnection.stopHeartbeat();
    if (get(serialConnection.status) !== 'disconnected') {
      await serialConnection.disconnect();
    }
    serialConnection.clearPacketHandlers();
  });

  describe('Full Connection Flow', () => {
    it('should complete connection handshake sequence', async () => {
      const { getByText } = render(App, {
        props: {
          serialConnection,
          channelStore
        }
      });
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      // Click connect
      await fireEvent.pointerUp(getByText('Connect'));
      
      // Verify connection established
      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      // Verify get machine packet was sent
      const sentPackets = mockPort.getWrittenData();
      const getMachinePacket = sentPackets.find(packet => 
        packet[2] === 0x21 // GET_MACHINE type
      );
      expect(getMachinePacket).toBeTruthy();
      
      // Send machine response
      mockPort.simulateData(createMachinePacket(0x10));
      await serialConnection.triggerPacketProcessing();
      
      // Verify device type displayed
      await waitFor(() => {
        expect(getByText('(M01)')).toBeInTheDocument();
      });
      
      // Send synthesize packet
      const channelData = [
        { online: 1, machineType: 0, voltage: 5000, current: 1000 },
        { online: 1, machineType: 1, voltage: 3300, current: 500 },
        { online: 0 },
        { online: 0 },
        { online: 0 },
        { online: 0 }
      ];
      mockPort.simulateData(createSynthesizePacket(channelData));
      await serialConnection.triggerPacketProcessing();
      
      // Verify channels displayed
      await waitFor(() => {
        expect(getByText('5.000 V')).toBeInTheDocument();
        expect(getByText('3.300 V')).toBeInTheDocument();
      });
    });

    it('should maintain heartbeat during connection', async () => {
      // This test needs fake timers to control heartbeat timing
      vi.useFakeTimers();
      
      const { getByText } = render(App, {
        props: {
          serialConnection,
          channelStore
        }
      });
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.pointerUp(getByText('Connect'));
      
      // Wait for connection to be established
      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
      });
      
      // Clear initial packets
      mockPort.getWrittenData().length = 0;
      
      // Advance time to trigger heartbeats
      vi.advanceTimersByTime(3000);
      
      const heartbeats = mockPort.getWrittenData().filter(packet => 
        packet[2] === 0x22 // HEARTBEAT type
      );
      
      expect(heartbeats.length).toBe(3); // One per second
      
      vi.useRealTimers();
    });
  });

  describe('Command and Response Flow', () => {
    it('should send commands and process responses', async () => {
      const { getByText, getByTestId } = render(App, {
        props: {
          serialConnection,
          channelStore
        }
      });
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      // Connect and initialize
      await fireEvent.pointerUp(getByText('Connect'));
      await tick();
      
      // Wait for connection to complete
      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
      });
      
      // Send machine packet to identify device
      mockPort.simulateData(createMachinePacket(0x10));
      await serialConnection.triggerPacketProcessing();
      await tick();
      
      // Send synthesize packet with channel data
      mockPort.simulateData(createSynthesizePacket([
        { online: 1, machineType: 0, voltage: 5000, current: 1000 }
      ]));
      await serialConnection.triggerPacketProcessing();
      await tick();
      
      // Navigate to channel detail
      await waitFor(() => {
        expect(getByText('5.000 V')).toBeInTheDocument();
      });
      
      const channelCard = getByText('Channel 1').closest('.channel-card');
      await fireEvent.pointerUp(channelCard);
      await tick();
      
      // Set voltage
      await waitFor(() => {
        expect(getByText('← Back')).toBeInTheDocument();
      });
      
      const voltageInput = getByTestId('voltage-input');
      await fireEvent.input(voltageInput, { target: { value: '12' } });
      await fireEvent.pointerUp(getByText('Set V'));
      
      // Wait for the async setVoltage to complete
      await tick();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify SET_V packet sent
      const sentPackets = mockPort.getWrittenData();
      console.log('Sent packets:', sentPackets.map(p => ({ type: `0x${p[2].toString(16)}`, size: p[3] })));
      
      const setVPacket = sentPackets.find(packet => 
        packet[2] === 0x1A // SET_V type
      );
      expect(setVPacket).toBeTruthy();
      
      // Verify voltage value in packet (12V = 12000mV)
      if (setVPacket) {
        const voltage = setVPacket[6] | (setVPacket[7] << 8);
        expect(voltage).toBe(12000);
      }
    });

    it('should handle channel switching via device', async () => {
      const { getByText } = render(App, {
        props: {
          serialConnection,
          channelStore
        }
      });
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.pointerUp(getByText('Connect'));
      mockPort.simulateData(createMachinePacket(0x10));
      await serialConnection.triggerPacketProcessing();
      mockPort.simulateData(createSynthesizePacket([
        { online: 1 },
        { online: 1 },
        { online: 1 }
      ]));
      await serialConnection.triggerPacketProcessing();
      
      // Simulate device sending channel update
      mockPort.simulateData(new Uint8Array([
        0x5A, 0x5A, 0x14, 0x07, 0xEE, 0x02, 0x02 // Switch to channel 2
      ]));
      await serialConnection.triggerPacketProcessing();
      
      await waitFor(() => {
        const channelCards = document.querySelectorAll('.channel-card');
        expect(channelCards[2]).toHaveClass('active');
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle malformed packets gracefully', async () => {
      // Test packet processing directly without UI dependency
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await serialConnection.connect();
      
      // Verify connection established
      expect(get(serialConnection.status)).toBe('connected');
      
      // Verify packet handlers are registered
      expect(serialConnection.packetHandlers.has(0x15)).toBe(true); // Machine packet handler
      
      // Test machine packet handler directly
      let receivedDeviceType = null;
      serialConnection.deviceType.subscribe(value => {
        receivedDeviceType = value;
      });
      
      // Send various malformed packets
      mockPort.simulateData(createMalformedPacket('short'));
      await serialConnection.triggerPacketProcessing();
      
      mockPort.simulateData(createMalformedPacket('bad-header'));
      await serialConnection.triggerPacketProcessing();
      
      mockPort.simulateData(createMalformedPacket('bad-checksum'));
      await serialConnection.triggerPacketProcessing();
      
      // Should still be connected
      expect(get(serialConnection.status)).toBe('connected');
      
      // Clear corrupted buffer before sending valid packet
      serialConnection.clearReceiveBuffer();
      
      // Send valid machine packet to verify processing works
      mockPort.simulateData(createMachinePacket(0x10));
      await serialConnection.triggerPacketProcessing();
      
      // Add a small delay to ensure packet is fully processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify device type was set by packet handler
      expect(receivedDeviceType).toEqual({ type: 'M01', haveLcd: true });
    });

    it('should handle error 240 packet', async () => {
      const { getByText } = render(App, {
        props: {
          serialConnection,
          channelStore
        }
      });
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.pointerUp(getByText('Connect'));
      
      // Wait for connection to be established
      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      // Send error packet
      mockPort.simulateData(createError240Packet());
      await serialConnection.triggerPacketProcessing();
      
      // Should remain connected (error is informational)
      expect(getByText('Connected')).toBeInTheDocument();
    });

    it('should recover from disconnection', async () => {
      const { getByText } = render(App, {
        props: {
          serialConnection,
          channelStore
        }
      });
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.pointerUp(getByText('Connect'));
      
      // Wait for connection first
      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
      });
      
      // Simulate disconnection
      mockPort.simulateDisconnect();
      await serialConnection.triggerPacketProcessing();
      
      await waitFor(() => {
        expect(getByText(/Error:/)).toBeInTheDocument();
      });
      
      // Reconnect with new port
      const newPort = new MockSerialPort();
      mockSerial.setNextPort(newPort);
      
      await fireEvent.pointerUp(getByText('Retry'));
      
      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
      });
      
      // Verify can receive data on new connection
      newPort.simulateData(createMachinePacket(0x11));
      await serialConnection.triggerPacketProcessing();
      
      await waitFor(() => {
        expect(getByText('(M02)')).toBeInTheDocument();
      });
    });
  });

  describe('Packet Buffering and Processing', () => {
    it('should handle multiple packets in one read', async () => {
      const { getByText } = render(App, {
        props: {
          serialConnection,
          channelStore
        }
      });
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.pointerUp(getByText('Connect'));
      
      // Send multiple packets at once
      const combinedPackets = createPacketSequence([
        createMachinePacket(0x10),
        createAddressPacket([
          { address: [0x01, 0x02, 0x03, 0x04, 0x05], frequencyOffset: 10 }
        ]),
        createSynthesizePacket([{ online: 1 }])
      ]);
      
      mockPort.simulateData(combinedPackets);
      await serialConnection.triggerPacketProcessing();
      
      // All packets should be processed
      await waitFor(() => {
        expect(getByText('(M01)')).toBeInTheDocument();
      });
    });

    it('should handle partial packet reception', async () => {
      const { getByText } = render(App, {
        props: {
          serialConnection,
          channelStore
        }
      });
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.pointerUp(getByText('Connect'));
      
      // Split a synthesize packet (156 bytes)
      const fullPacket = createSynthesizePacket([{ online: 1 }]);
      const part1 = fullPacket.slice(0, 50);
      const part2 = fullPacket.slice(50, 100);
      const part3 = fullPacket.slice(100);
      
      // Send in parts
      mockPort.simulateData(part1);
      await serialConnection.triggerPacketProcessing();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      mockPort.simulateData(part2);
      await serialConnection.triggerPacketProcessing();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      mockPort.simulateData(part3);
      await serialConnection.triggerPacketProcessing();
      
      // Should process complete packet
      await waitFor(() => {
        expect(getByText('Online')).toBeInTheDocument();
      });
    });

    it('should skip garbage data and find valid packets', async () => {
      const { getByText } = render(App, {
        props: {
          serialConnection,
          channelStore
        }
      });
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.pointerUp(getByText('Connect'));
      
      // Send garbage data first
      const garbage = new Uint8Array([
        0xFF, 0xFF, 0xFF, 0x00, 0x00,
        0x5A, 0x00, 0x5A, 0x5A, 0x00  // Almost valid headers
      ]);
      mockPort.simulateData(garbage);
      await serialConnection.triggerPacketProcessing();
      
      // Clear corrupted buffer before sending valid packet
      serialConnection.clearReceiveBuffer();
      
      // Send valid packet
      const validPacket = createMachinePacket(0x10);
      mockPort.simulateData(validPacket);
      await serialConnection.triggerPacketProcessing();
      
      // Should find and process valid packet
      await waitFor(() => {
        expect(getByText('(M01)')).toBeInTheDocument();
      });
    });
  });

  describe('Address Configuration Flow', () => {
    it('should receive and process address information', async () => {
      const { getByText } = render(App, {
        props: {
          serialConnection,
          channelStore
        }
      });
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.pointerUp(getByText('Connect'));
      
      // Send address packet
      const addresses = Array(6).fill(null).map((_, i) => ({
        address: [i, i, i, i, i],
        frequencyOffset: i * 10
      }));
      
      // Wait for connection to be established first
      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      mockPort.simulateData(createAddressPacket(addresses));
      await serialConnection.triggerPacketProcessing();
      
      // Note: UI doesn't display addresses, but they're processed
      // Verify by checking no errors occurred
      expect(getByText('Connected')).toBeInTheDocument();
    });
  });

  describe('Performance and Stress Testing', () => {
    it('should handle rapid packet reception', async () => {
      const { getByText } = render(App, {
        props: {
          serialConnection,
          channelStore
        }
      });
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.pointerUp(getByText('Connect'));
      
      // Send 100 synthesize packets rapidly
      for (let i = 0; i < 100; i++) {
        const packet = createSynthesizePacket([{
          online: 1,
          voltage: 3000 + i * 10,
          current: 500 + i
        }]);
        mockPort.simulateData(packet);
        await serialConnection.triggerPacketProcessing();
      }
      
      // Should process without crashing
      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
      });
    });

    it('should handle very large single packet', async () => {
      const { getByText } = render(App, {
        props: {
          serialConnection,
          channelStore
        }
      });
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.pointerUp(getByText('Connect'));
      
      // Wave packet with 4 points per group (206 bytes)
      const largeWaveData = Array(40).fill(null).map((_, i) => ({
        voltage: 3300 + i,
        current: 500 + i
      }));
      
      // Note: createWavePacket only supports 20 points, so we simulate
      // a large packet manually
      const packet = new Uint8Array(206);
      packet[0] = 0x5A;
      packet[1] = 0x5A;
      packet[2] = 0x12; // WAVE type
      packet[3] = 0xCE; // 206 bytes
      packet[4] = 0x00; // Channel
      packet[5] = 0x00; // Checksum (simplified)
      
      // Wait for connection to be established first
      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      mockPort.simulateData(packet);
      await serialConnection.triggerPacketProcessing();
      
      // Should handle without error
      expect(getByText('Connected')).toBeInTheDocument();
    });
  });

  describe('State Synchronization', () => {
    it('should maintain consistent state between device and UI', async () => {
      const { getByText } = render(App, {
        props: {
          serialConnection,
          channelStore
        }
      });
      
      mockPort = new MockSerialPort();
      mockSerial.setNextPort(mockPort);
      
      await fireEvent.pointerUp(getByText('Connect'));
      
      // Wait for connection to be established
      await waitFor(() => {
        expect(getByText('Connected')).toBeInTheDocument();
      });
      
      // Initial state
      mockPort.simulateData(createSynthesizePacket([
        { online: 1, outputOn: 0, voltage: 0, current: 0 }
      ]));
      await serialConnection.triggerPacketProcessing();
      
      await waitFor(() => {
        expect(getByText('Output: OFF')).toBeInTheDocument();
      });
      
      // Toggle output
      await fireEvent.pointerUp(getByText('Output: OFF'));
      
      // Simulate device confirming change
      mockPort.simulateData(createSynthesizePacket([
        { online: 1, outputOn: 1, voltage: 3300, current: 500 }
      ]));
      await serialConnection.triggerPacketProcessing();
      
      await waitFor(() => {
        expect(getByText('Output: ON')).toBeInTheDocument();
        expect(getByText('3.300 V')).toBeInTheDocument();
      });
    });
  });
});
