import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { createSignal } from '@mdp-core/util/signal';

const mockProcessSynthesizePacket = vi.hoisted(() => vi.fn());
const mockProcessAddressPacket = vi.hoisted(() => vi.fn());
const mockProcessMachinePacket = vi.hoisted(() => vi.fn());

vi.mock('$lib/packet-decoder.js', () => ({
  processSynthesizePacket: mockProcessSynthesizePacket,
  processAddressPacket: mockProcessAddressPacket,
  processMachinePacket: mockProcessMachinePacket,
}));

vi.mock('@mdp-core/protocol/packet-decoder', () => ({
  processSynthesizePacket: mockProcessSynthesizePacket,
  processAddressPacket: mockProcessAddressPacket,
  processMachinePacket: mockProcessMachinePacket,
}));

import { createChannelStore } from '$lib/stores/channels.js';

function createPacketBus() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    onRawPacket: createSignal(),
    onDecodedPacket: createSignal(),
    onSynthesize: createSignal(),
    onWave: createSignal(),
    onAddress: createSignal(),
    onMachine: createSignal(),
    onUpdateChannel: createSignal(),
  };
}

describe('Channel Store', () => {
  let packets;
  let serial;
  let channelStore;

  beforeEach(() => {
    vi.clearAllMocks();

    packets = createPacketBus();
    serial = {
      sendPacket: vi.fn().mockResolvedValue(undefined),
      setDeviceType: vi.fn(),
    };

    channelStore = createChannelStore({ serial, packets });
  });

  describe('Initial State', () => {
    it('initializes with 6 offline channels', () => {
      const channels = get(channelStore.channels);
      expect(channels).toHaveLength(6);
      channels.forEach((ch, i) => {
        expect(ch.channel).toBe(i);
        expect(ch.online).toBe(false);
        expect(ch.waveformData).toEqual([]);
        expect(ch.recording).toBe(false);
      });
    });

    it('starts with waitingSynthesize true', () => {
      expect(get(channelStore.waitingSynthesize)).toBe(true);
    });
  });

  describe('Packet Handling', () => {
    it('updates channel data on synthesize packets', () => {
      mockProcessSynthesizePacket.mockReturnValue(
        Array.from({ length: 6 }, (_, i) => ({
          channel: i,
          online: i === 2,
          machineType: 'P906',
          voltage: i === 2 ? 5 : 0,
          current: i === 2 ? 1 : 0,
          power: i === 2 ? 5 : 0,
          temperature: 25,
          isOutput: false,
          mode: 'Normal',
          inputVoltage: 0,
          inputCurrent: 0,
          inputPower: 0,
          targetVoltage: 0,
          targetCurrent: 0,
          targetPower: 0,
        }))
      );

      packets.onSynthesize.emit({ packType: 0x11, size: 0, data: { channels: [] } });

      const channels = get(channelStore.channels);
      expect(channels[2].online).toBe(true);
      expect(channels[2].voltage).toBe(5);
      expect(channels[2].current).toBe(1);
      expect(get(channelStore.waitingSynthesize)).toBe(false);
    });

    it('updates activeChannel from update-channel packets', () => {
      expect(get(channelStore.activeChannel)).toBe(0);

      packets.onUpdateChannel.emit({ data: { targetChannel: 3 } });

      expect(get(channelStore.activeChannel)).toBe(3);
    });

    it('updates address from address packets', () => {
      mockProcessAddressPacket.mockReturnValue([
        { channel: 1, address: [1, 2, 3, 4, 5], frequency: 2450 },
      ]);

      packets.onAddress.emit({ packType: 0x13, size: 0, data: { addresses: [] } });

      const channels = get(channelStore.channels);
      expect(channels[1].address).toEqual([1, 2, 3, 4, 5]);
    });

    it('sets device type from machine packets', () => {
      mockProcessMachinePacket.mockReturnValue({ type: 'M01', hasLCD: true });
      packets.onMachine.emit({ packType: 0x15, size: 0, data: { machineTypeRaw: 0x10 } });
      expect(serial.setDeviceType).toHaveBeenCalledWith({ type: 'M01', hasLCD: true });
    });
  });

  describe('Channel Control Functions', () => {
    it('setActiveChannel sends packet and updates store', async () => {
      await channelStore.setActiveChannel(2);
      expect(serial.sendPacket).toHaveBeenCalled();
      expect(get(channelStore.activeChannel)).toBe(2);
    });

    it('setVoltage sends packet and updates target values', async () => {
      await channelStore.setVoltage(1, 5.0, 1.0);

      expect(serial.sendPacket).toHaveBeenCalled();
      const channels = get(channelStore.channels);
      expect(channels[1].targetVoltage).toBe(5.0);
      expect(channels[1].targetCurrent).toBe(1.0);
      expect(channels[1].targetPower).toBe(5.0);
    });

    it('setCurrent sends packet and updates target values', async () => {
      await channelStore.setCurrent(2, 3.3, 2.0);

      expect(serial.sendPacket).toHaveBeenCalled();
      const channels = get(channelStore.channels);
      expect(channels[2].targetVoltage).toBe(3.3);
      expect(channels[2].targetCurrent).toBe(2.0);
      expect(channels[2].targetPower).toBeCloseTo(6.6);
    });

    it('setOutput sends packet', async () => {
      await channelStore.setOutput(3, true);
      expect(serial.sendPacket).toHaveBeenCalled();
    });
  });

  describe('Recording Functions', () => {
    it('startRecording initializes waveform capture for a channel', () => {
      channelStore.startRecording(1);
      const channels = get(channelStore.channels);
      expect(channels[1].recording).toBe(true);
      expect(channels[1].waveformData).toHaveLength(0);
      expect(channels[1].runningTimeUs).toBe(0);
    });

    it('wave packets append waveform points while recording', () => {
      channelStore.startRecording(2);

      packets.onWave.emit({
        packType: 0x12,
        size: 126,
        data: {
          channel: 2,
          groups: [
            {
              timestamp: 1000,
              items: [
                { voltage: 3.3, current: 0.5 },
                { voltage: 3.31, current: 0.51 },
              ],
            },
          ],
        },
      });

      const ch = get(channelStore.channels)[2];
      expect(ch.waveformData.length).toBeGreaterThan(0);
    });

    it('stopRecording preserves collected waveform data', () => {
      channelStore.startRecording(3);

      packets.onWave.emit({
        packType: 0x12,
        size: 126,
        data: {
          channel: 3,
          groups: [
            {
              timestamp: 1000,
              items: [
                { voltage: 3.3, current: 0.5 },
                { voltage: 3.3, current: 0.5 },
              ],
            },
          ],
        },
      });

      channelStore.stopRecording(3);

      const ch = get(channelStore.channels)[3];
      expect(ch.recording).toBe(false);
      expect(ch.waveformData.length).toBeGreaterThan(0);
    });

    it('clearRecording removes waveform data', () => {
      channelStore.startRecording(4);
      packets.onWave.emit({
        packType: 0x12,
        size: 126,
        data: {
          channel: 4,
          groups: [
            {
              timestamp: 1000,
              items: [
                { voltage: 3.3, current: 0.5 },
                { voltage: 3.3, current: 0.5 },
              ],
            },
          ],
        },
      });

      channelStore.clearRecording(4);
      const ch = get(channelStore.channels)[4];
      expect(ch.waveformData).toHaveLength(0);
    });
  });

  describe('Derived Stores', () => {
    it('recordingChannels returns channels with recording=true', () => {
      channelStore.startRecording(1);
      channelStore.startRecording(3);

      const recordingChannels = get(channelStore.recordingChannels);
      expect(recordingChannels.map((c) => c.channel)).toEqual([1, 3]);
    });

    it('activeChannelData reflects current active channel', async () => {
      await channelStore.setActiveChannel(2);
      const active = get(channelStore.activeChannelData);
      expect(active.channel).toBe(2);
    });
  });
});
