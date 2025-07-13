import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSynthesizePacket, createWavePacket, createUpdateChannelPacket } from '../../mocks/packet-data.js';
import { serialConnection as serialConnectionImport } from '$lib/serial.js';
import { channelStore as channelStoreImport } from '$lib/stores/channels.js';

// Mock the kaitai-wrapper first (before any imports that use it)
vi.mock('$lib/kaitai-wrapper.js', () => {
  const PackType = {
    SYNTHESIZE: 0x11,
    WAVE: 0x12,
    ADDR: 0x13,
    UPDAT_CH: 0x14,
    MACHINE: 0x15
  };

  class KaitaiStream {
    constructor(buffer) {
      this.buffer = buffer.buffer instanceof ArrayBuffer ? buffer.buffer : buffer;
      this.pos = 0;
      this.view = new DataView(this.buffer);
    }
    
    readU1() {
      return this.view.getUint8(this.pos++);
    }
    
    readU2le() {
      if (this.pos + 2 > this.buffer.byteLength) throw new RangeError("Offset is outside the bounds of the DataView");
      const val = this.view.getUint16(this.pos, true);
      this.pos += 2;
      return val;
    }
    
    readU4le() {
      if (this.pos + 4 > this.buffer.byteLength) throw new RangeError("Offset is outside the bounds of the DataView");
      const val = this.view.getUint32(this.pos, true);
      this.pos += 4;
      return val;
    }
    
    readBytes(n) {
      if (this.pos + n > this.buffer.byteLength) throw new RangeError("Offset is outside the bounds of the DataView");
      const bytes = new Uint8Array(this.buffer.slice(this.pos, this.pos + n));
      this.pos += n;
      return bytes;
    }
  }

  class MiniwareMdpM01 {
    constructor(stream) {
      this.stream = stream;
      this.packets = [];
      this._read();
    }
    
    _read() {
      if (this.stream.buffer.byteLength < 6) return;
      this.stream.readU1(); // header1
      this.stream.readU1(); // header2
      const packetType = this.stream.readU1();
      this.size = this.stream.readU1();
      this.channel = this.stream.readU1();
      this.checksum = this.stream.readU1();
      
      const packet = {
        packType: packetType,
        size: this.size,
        channel: this.channel,
        checksum: this.checksum,
        data: null
      };
      
      // Parse data based on packet type
      if (packetType === PackType.SYNTHESIZE) {
        packet.data = { channels: [] };
        // Read actual synthesize data from stream
        for (let i = 0; i < 6; i++) {
          const ch = {
            num: this.stream.readU1(),
            outVoltageRaw: this.stream.readU2le(),
            outCurrentRaw: this.stream.readU2le(),
            inVoltageRaw: this.stream.readU2le(),
            inCurrentRaw: this.stream.readU2le(),
            setVoltageRaw: this.stream.readU2le(),
            setCurrentRaw: this.stream.readU2le(),
            tempRaw: this.stream.readU2le(),
            online: this.stream.readU1(),
            type: this.stream.readU1(),
            lock: this.stream.readU1(),
            statusLoad: this.stream.readU1(),
            outputOn: this.stream.readU1(),
            color: this.stream.readBytes(3),
            error: this.stream.readU1(),
            end: this.stream.readBytes(1)
          };
          // Add computed properties
          ch.outVoltage = ch.outVoltageRaw / 1000.0;
          ch.outCurrent = ch.outCurrentRaw / 1000.0;
          ch.temperature = ch.tempRaw / 10.0;
          packet.data.channels.push(ch);
        }
      } else if (packetType === PackType.WAVE) {
        packet.data = {
          channel: this.channel,
          groups: [{
            timestamp: 1000,
            items: [
              { voltage: 3.3, current: 0.5 },
              { voltage: 3.3, current: 0.5 }
            ]
          }]
        };
      }
      
      this.packets.push(packet);
    }
  }
  
  MiniwareMdpM01.PackType = PackType;
  
  return {
    KaitaiStream,
    MiniwareMdpM01
  };
});

// Mock the serial connection
vi.mock('$lib/serial.js', () => {
  const mockHandlers = {};
  
  return {
    serialConnection: {
      registerPacketHandler: vi.fn((type, handler) => {
        mockHandlers[type] = handler;
      }),
      sendPacket: vi.fn(),
      deviceTypeStore: {
        set: vi.fn()
      },
      _mockHandlers: mockHandlers
    }
  };
});

describe('Channel Store', () => {
  let channelStore;
  let serialConnection;
  let packetHandlers = {};
  
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    packetHandlers = {};

    // Re-import mocks and store to re-initialize
    const serialModule = await import('$lib/serial.js');
    serialConnection = serialModule.serialConnection;

    // Capture packet handlers
    serialConnection.registerPacketHandler.mockImplementation((type, handler) => {
      packetHandlers[type] = handler;
    });
    
    const storeModule = await import('$lib/stores/channels.js');
    channelStore = storeModule.channelStore;
  });

  describe('Initial State', () => {
    it('should initialize with 6 offline channels', () => {
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels).toHaveLength(6);
      channels.forEach((channel, index) => {
        expect(channel.channel).toBe(index);
        expect(channel.online).toBe(false);
        expect(channel.voltage).toBe(0);
        expect(channel.current).toBe(0);
      });
      
      unsubscribe();
    });

    it('should initialize with channel 0 as active', () => {
      let activeChannel;
      const unsubscribe = channelStore.activeChannel.subscribe(value => activeChannel = value);
      
      expect(activeChannel).toBe(0);
      
      unsubscribe();
    });
  });

  describe('Packet Handler Registration', () => {
    it('should register handlers for all expected packet types', () => {
      expect(serialConnection.registerPacketHandler).toHaveBeenCalledWith(0x11, expect.any(Function));
      expect(serialConnection.registerPacketHandler).toHaveBeenCalledWith(0x12, expect.any(Function));
      expect(serialConnection.registerPacketHandler).toHaveBeenCalledWith(0x14, expect.any(Function));
      expect(serialConnection.registerPacketHandler).toHaveBeenCalledWith(0x15, expect.any(Function));
    });
  });

  describe('Synthesize Packet Handling', () => {
    it('should update channels with synthesize packet data', () => {
      const synthesizeHandler = packetHandlers[0x11];
      expect(synthesizeHandler).toBeDefined();
      
      const packet = createSynthesizePacket();
      synthesizeHandler(packet);
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      // First channel should be online
      expect(channels[0].online).toBe(true);
      expect(channels[0].voltage).toBeCloseTo(3.3);
      expect(channels[0].current).toBeCloseTo(0.5);
      expect(channels[0].temperature).toBeCloseTo(25.5);
      
      // Other channels should be offline
      for (let i = 1; i < 6; i++) {
        expect(channels[i].online).toBe(false);
      }
      
      unsubscribe();
    });

    it('should preserve waveform data when updating channels', () => {
      // First add some waveform data
      channelStore.channels.update(chs => {
        chs[0].waveformData = [{ timestamp: 1000, voltage: 3.3, current: 0.5 }];
        return chs;
      });
      
      const synthesizeHandler = packetHandlers[0x11];
      const packet = createSynthesizePacket();
      synthesizeHandler(packet);
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      // Waveform data should be preserved
      expect(channels[0].waveformData).toHaveLength(1);
      expect(channels[0].waveformData[0].timestamp).toBe(1000);
      
      unsubscribe();
    });
  });

  describe('Wave Packet Handling', () => {
    it('should add wave data to recording channel', () => {
      // Start recording on channel 0
      channelStore.channels.update(chs => {
        chs[0].recording = true;
        return chs;
      });
      
      const waveHandler = packetHandlers[0x12];
      expect(waveHandler).toBeDefined();
      
      const packet = createWavePacket(0, 126);
      waveHandler(packet);
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      // Should have added wave data
      expect(channels[0].waveformData.length).toBeGreaterThan(0);
      
      unsubscribe();
    });

    it('should not add wave data to non-recording channel', () => {
      const waveHandler = packetHandlers[0x12];
      const packet = createWavePacket(0, 126);
      waveHandler(packet);
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      // Should not have added wave data
      expect(channels[0].waveformData).toHaveLength(0);
      
      unsubscribe();
    });
  });

  describe('Update Channel Packet Handling', () => {
    it('should update active channel', () => {
      const updateHandler = packetHandlers[0x14];
      expect(updateHandler).toBeDefined();
      
      const packet = createUpdateChannelPacket(3);
      updateHandler(packet);
      
      let activeChannel;
      const unsubscribe = channelStore.activeChannel.subscribe(value => activeChannel = value);
      
      expect(activeChannel).toBe(3);
      
      unsubscribe();
    });
  });

  describe('Channel Control Functions', () => {
    it('should send set channel packet', async () => {
      await channelStore.setActiveChannel(2);
      
      expect(serialConnection.sendPacket).toHaveBeenCalled();
      const sentPacket = serialConnection.sendPacket.mock.calls[0][0];
      expect(sentPacket[2]).toBe(0x19); // PACK_SET_CH
      
      let activeChannel;
      const unsubscribe = channelStore.activeChannel.subscribe(value => activeChannel = value);
      expect(activeChannel).toBe(2);
      unsubscribe();
    });

    it('should send set voltage packet and update target values', async () => {
      await channelStore.setVoltage(1, 5.0, 1.0);
      
      expect(serialConnection.sendPacket).toHaveBeenCalled();
      const sentPacket = serialConnection.sendPacket.mock.calls[0][0];
      expect(sentPacket[2]).toBe(0x1A); // PACK_SET_V
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      expect(channels[1].targetVoltage).toBe(5.0);
      expect(channels[1].targetCurrent).toBe(1.0);
      unsubscribe();
    });

    it('should send set current packet', async () => {
      await channelStore.setCurrent(2, 3.3, 2.0);
      
      expect(serialConnection.sendPacket).toHaveBeenCalled();
      const sentPacket = serialConnection.sendPacket.mock.calls[0][0];
      expect(sentPacket[2]).toBe(0x1B); // PACK_SET_I
    });

    it('should send set output packet', async () => {
      await channelStore.setOutput(3, true);
      
      expect(serialConnection.sendPacket).toHaveBeenCalled();
      const sentPacket = serialConnection.sendPacket.mock.calls[0][0];
      expect(sentPacket[2]).toBe(0x16); // PACK_SET_ISOUTPUT
    });
  });

  describe('Recording Functions', () => {
    it('should start recording for a channel', () => {
      channelStore.startRecording(1);
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels[1].recording).toBe(true);
      expect(channels[1].waveformData).toHaveLength(0);
      
      unsubscribe();
    });

    it('should stop recording for a channel', () => {
      // First start recording
      channelStore.startRecording(2);
      
      // Add some wave data
      const waveHandler = packetHandlers[0x12];
      const packet = createWavePacket(2, 126);
      waveHandler(packet);
      
      // Stop recording
      channelStore.stopRecording(2);
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      expect(channels[2].recording).toBe(false);
      expect(channels[2].waveformData.length).toBeGreaterThan(0); // Data preserved
      
      unsubscribe();
    });

    it('should clear recording data', () => {
      // Start recording and add some data via wave packet
      channelStore.startRecording(3);
      const waveHandler = packetHandlers[0x12];
      const packet = createWavePacket(3, 126);
      waveHandler(packet);
      
      // Clear recording
      channelStore.clearRecording(3);
      
      let channels;
      const unsubscribe = channelStore.channels.subscribe(value => channels = value);
      
      // Channel 3 should have empty waveform data after clearing
      expect(channels[3].waveformData).toHaveLength(0);
      
      unsubscribe();
    });
  });

  describe('Derived Stores', () => {
    it('should provide recording channels', () => {
      // Start recording on channels 1 and 3
      channelStore.startRecording(1);
      channelStore.startRecording(3);
      
      let recordingChannels;
      const unsubscribe = channelStore.recordingChannels.subscribe(value => recordingChannels = value);
      
      expect(recordingChannels).toHaveLength(2);
      expect(recordingChannels[0].channel).toBe(1);
      expect(recordingChannels[1].channel).toBe(3);
      
      unsubscribe();
    });

    it('should provide active channel data', async () => {
      // Make channel 2 active
      await channelStore.setActiveChannel(2);
      
      // Send synthesize packet with data for channel 2
      const synthesizeHandler = packetHandlers[0x11];
      const packet = createSynthesizePacket([
        { online: 0 },
        { online: 0 },
        { online: 1, voltage: 5000, current: 1000 },
        { online: 0 },
        { online: 0 },
        { online: 0 }
      ]);
      synthesizeHandler(packet);
      
      let activeChannelData;
      const unsubscribe = channelStore.activeChannelData.subscribe(value => activeChannelData = value);
      
      expect(activeChannelData.channel).toBe(2);
      expect(activeChannelData.online).toBe(true);
      expect(activeChannelData.voltage).toBe(5.0);
      
      unsubscribe();
    });
  });
});