import { describe, it, expect, beforeEach, vi } from 'vitest';
import { channelStore } from '../../../src/lib/stores/channels.js';
import { serialConnection } from '../../../src/lib/serial.js';
import { createSynthesizePacket, createWavePacket, createUpdateChannelPacket } from '../../mocks/packet-data.js';

// Mock the serial connection
vi.mock('../../../src/lib/serial.js', () => ({
  serialConnection: {
    registerPacketHandler: vi.fn(),
    sendPacket: vi.fn().mockResolvedValue(undefined),
    deviceTypeStore: {
      set: vi.fn()
    }
  }
}));

// Mock packet encoder
vi.mock('../../../src/lib/packet-encoder.js', () => ({
  createSetChannelPacket: vi.fn((ch) => [0x5A, 0x5A, 0x19, 0x06, ch, 0x00]),
  createSetVoltagePacket: vi.fn((ch, v, c) => [0x5A, 0x5A, 0x1A, 0x0A, ch, 0x00, 0, 0, 0, 0]),
  createSetCurrentPacket: vi.fn((ch, v, c) => [0x5A, 0x5A, 0x1B, 0x0A, ch, 0x00, 0, 0, 0, 0]),
  createSetOutputPacket: vi.fn((ch, on) => [0x5A, 0x5A, 0x16, 0x07, ch, 0x00, on ? 1 : 0])
}));

describe('Channel Store', () => {
  let packetHandlers = {};
  
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    packetHandlers = {};
    
    // Capture packet handlers
    serialConnection.registerPacketHandler.mockImplementation((type, handler) => {
      packetHandlers[type] = handler;
    });
    
    // Re-initialize store to register handlers
    // Note: In real implementation, might need to re-import or reset store
  });

  describe('Initial State', () => {
    it('should initialize with 6 empty channels', () => {
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels).toHaveLength(6);
      channels.forEach((channel, i) => {
        expect(channel).toMatchObject({
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
        });
      });
      
      unsubscribe();
    });

    it('should start with channel 0 as active', () => {
      let activeChannel;
      const unsubscribe = channelStore.activeChannel.subscribe(value => activeChannel = value);
      
      expect(activeChannel).toBe(0);
      
      unsubscribe();
    });

    it('should start waiting for synthesize packet', () => {
      let waiting;
      const unsubscribe = channelStore.waitingSynthesize.subscribe(value => waiting = value);
      
      expect(waiting).toBe(true);
      
      unsubscribe();
    });
  });

  describe('Packet Handler Registration', () => {
    it('should register handlers for all packet types', () => {
      // Store creation should register handlers
      expect(serialConnection.registerPacketHandler).toHaveBeenCalledWith(0x11, expect.any(Function));
      expect(serialConnection.registerPacketHandler).toHaveBeenCalledWith(0x12, expect.any(Function));
      expect(serialConnection.registerPacketHandler).toHaveBeenCalledWith(0x14, expect.any(Function));
      expect(serialConnection.registerPacketHandler).toHaveBeenCalledWith(0x15, expect.any(Function));
    });
  });

  describe('Synthesize Packet Processing', () => {
    it('should update channel data from synthesize packet', () => {
      const synthesizeHandler = packetHandlers[0x11];
      const packet = createSynthesizePacket([
        { online: 1, machineType: 0, voltage: 5000, current: 1000, temperature: 255, isOutput: 1 },
        { online: 1, machineType: 1, voltage: 3300, current: 500, temperature: 200, isOutput: 0 }
      ]);
      
      synthesizeHandler(Array.from(packet));
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels[0]).toMatchObject({
        online: true,
        machineType: 'P905',
        voltage: 5,
        current: 1,
        power: 5,
        temperature: 25.5,
        isOutput: true
      });
      
      expect(channels[1]).toMatchObject({
        online: true,
        machineType: 'P906',
        voltage: 3.3,
        current: 0.5,
        power: 1.65,
        temperature: 20,
        isOutput: false
      });
      
      unsubscribe();
    });

    it('should clear waiting flag after first synthesize', () => {
      const synthesizeHandler = packetHandlers[0x11];
      const packet = createSynthesizePacket();
      
      synthesizeHandler(Array.from(packet));
      
      let waiting;
      const unsubscribe = channelStore.waitingSynthesize.subscribe(value => waiting = value);
      
      expect(waiting).toBe(false);
      
      unsubscribe();
    });

    it('should preserve waveform data when updating channel', () => {
      // First, add some waveform data
      channelStore.startRecording(0);
      
      let channels;
      channelStore.channels.subscribe(value => channels = value)();
      
      // Manually add some data
      channels[0].waveformData = [
        { timestamp: 0, voltage: 3.3, current: 0.5 },
        { timestamp: 10, voltage: 3.4, current: 0.6 }
      ];
      
      // Process synthesize packet
      const synthesizeHandler = packetHandlers[0x11];
      const packet = createSynthesizePacket([
        { voltage: 3500, current: 600 }
      ]);
      
      synthesizeHandler(Array.from(packet));
      
      // Check waveform data is preserved
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      expect(channels[0].waveformData).toHaveLength(2);
      unsubscribe();
    });
  });

  describe('Wave Packet Processing', () => {
    it('should add wave data when recording', () => {
      const waveHandler = packetHandlers[0x12];
      
      // Start recording on channel 0
      channelStore.startRecording(0);
      
      // Send wave packet
      const packet = createWavePacket(0, [
        { voltage: 3300, current: 500 },
        { voltage: 3400, current: 600 }
      ]);
      
      waveHandler(Array.from(packet));
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels[0].recording).toBe(true);
      expect(channels[0].waveformData.length).toBeGreaterThan(0);
      
      // Check first few points
      expect(channels[0].waveformData[0]).toMatchObject({
        timestamp: 0,
        voltage: 3.3,
        current: 0.5
      });
      
      unsubscribe();
    });

    it('should not add wave data when not recording', () => {
      const waveHandler = packetHandlers[0x12];
      
      // Don't start recording
      const packet = createWavePacket(0);
      waveHandler(Array.from(packet));
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels[0].waveformData).toHaveLength(0);
      
      unsubscribe();
    });

    it('should handle wave data for different channels', () => {
      const waveHandler = packetHandlers[0x12];
      
      // Start recording on channels 1 and 3
      channelStore.startRecording(1);
      channelStore.startRecording(3);
      
      // Send wave packets
      waveHandler(Array.from(createWavePacket(1)));
      waveHandler(Array.from(createWavePacket(2))); // Not recording
      waveHandler(Array.from(createWavePacket(3)));
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels[1].waveformData.length).toBeGreaterThan(0);
      expect(channels[2].waveformData.length).toBe(0);
      expect(channels[3].waveformData.length).toBeGreaterThan(0);
      
      unsubscribe();
    });
  });

  describe('Update Channel Packet Processing', () => {
    it('should update active channel', () => {
      const updateHandler = packetHandlers[0x14];
      const packet = createUpdateChannelPacket(3);
      
      updateHandler(Array.from(packet));
      
      let activeChannel;
      const unsubscribe = channelStore.activeChannel.subscribe(value => activeChannel = value);
      
      expect(activeChannel).toBe(3);
      
      unsubscribe();
    });

    it('should handle invalid channel numbers', () => {
      const updateHandler = packetHandlers[0x14];
      const packet = new Uint8Array([0x5A, 0x5A, 0x14, 0x06, 0xEE, 0x00]); // Too short
      
      updateHandler(Array.from(packet));
      
      let activeChannel;
      const unsubscribe = channelStore.activeChannel.subscribe(value => activeChannel = value);
      
      // Should remain unchanged
      expect(activeChannel).toBe(0);
      
      unsubscribe();
    });
  });

  describe('Channel Control Functions', () => {
    it('should set active channel', async () => {
      await channelStore.setActiveChannel(4);
      
      expect(serialConnection.sendPacket).toHaveBeenCalledWith([0x5A, 0x5A, 0x19, 0x06, 4, 0x00]);
      
      let activeChannel;
      const unsubscribe = channelStore.activeChannel.subscribe(value => activeChannel = value);
      expect(activeChannel).toBe(4);
      unsubscribe();
    });

    it('should set voltage and update targets', async () => {
      await channelStore.setVoltage(2, 12.5, 2.0);
      
      expect(serialConnection.sendPacket).toHaveBeenCalled();
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels[2].targetVoltage).toBe(12.5);
      expect(channels[2].targetCurrent).toBe(2.0);
      
      unsubscribe();
    });

    it('should set current and update targets', async () => {
      await channelStore.setCurrent(1, 5.0, 1.5);
      
      expect(serialConnection.sendPacket).toHaveBeenCalled();
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels[1].targetVoltage).toBe(5.0);
      expect(channels[1].targetCurrent).toBe(1.5);
      
      unsubscribe();
    });

    it('should toggle output', async () => {
      await channelStore.setOutput(0, true);
      expect(serialConnection.sendPacket).toHaveBeenCalledWith([0x5A, 0x5A, 0x16, 0x07, 0, 0x00, 1]);
      
      await channelStore.setOutput(0, false);
      expect(serialConnection.sendPacket).toHaveBeenCalledWith([0x5A, 0x5A, 0x16, 0x07, 0, 0x00, 0]);
    });
  });

  describe('Recording Functions', () => {
    it('should start recording', () => {
      channelStore.startRecording(2);
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels[2].recording).toBe(true);
      expect(channels[2].waveformData).toEqual([]);
      
      unsubscribe();
    });

    it('should stop recording', () => {
      channelStore.startRecording(1);
      channelStore.stopRecording(1);
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels[1].recording).toBe(false);
      
      unsubscribe();
    });

    it('should clear recording data', () => {
      // Add some data first
      channelStore.startRecording(0);
      const waveHandler = packetHandlers[0x12];
      waveHandler(Array.from(createWavePacket(0)));
      
      // Clear it
      channelStore.clearRecording(0);
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels[0].waveformData).toEqual([]);
      
      unsubscribe();
    });

    it('should handle recording multiple channels simultaneously', () => {
      channelStore.startRecording(0);
      channelStore.startRecording(2);
      channelStore.startRecording(4);
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels[0].recording).toBe(true);
      expect(channels[1].recording).toBe(false);
      expect(channels[2].recording).toBe(true);
      expect(channels[3].recording).toBe(false);
      expect(channels[4].recording).toBe(true);
      expect(channels[5].recording).toBe(false);
      
      unsubscribe();
    });
  });

  describe('Store Subscriptions', () => {
    it('should allow multiple subscriptions', () => {
      const values1 = [];
      const values2 = [];
      
      const unsub1 = channelStore.activeChannel.subscribe(v => values1.push(v));
      const unsub2 = channelStore.activeChannel.subscribe(v => values2.push(v));
      
      channelStore.setActiveChannel(3);
      
      expect(values1).toContain(3);
      expect(values2).toContain(3);
      
      unsub1();
      unsub2();
    });

    it('should stop updates after unsubscribe', () => {
      const values = [];
      const unsubscribe = channelStore.activeChannel.subscribe(v => values.push(v));
      
      channelStore.setActiveChannel(1);
      unsubscribe();
      channelStore.setActiveChannel(2);
      
      expect(values).toContain(1);
      expect(values).not.toContain(2);
    });
  });
});