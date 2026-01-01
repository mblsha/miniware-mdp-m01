import { derived, writable } from 'svelte/store';
import type { Readable, Writable } from 'svelte/store';
import type { Channel, WaveformPoint } from '../types';
import { processAddressPacket, processMachinePacket, processSynthesizePacket } from '../packet-decoder';
import type { AddressPacket, ChannelUpdate, MachinePacket, SynthesizePacket, UpdateChannelPacket, WavePacket } from '../packet-decoder';
import { createSetChannelPacket, createSetCurrentPacket, createSetOutputPacket, createSetVoltagePacket } from '../packet-encoder';
import { debugError } from '../debug-logger';
import type { PacketBus } from '../services/packet-bus';
import type { SerialConnection } from '../serial';

export type ChannelStore = ReturnType<typeof createChannelStore>;

export function createChannelStore(options: { serial: SerialConnection; packets: PacketBus }): {
  channels: Writable<Channel[]>;
  activeChannel: Readable<number>;
  waitingSynthesize: Readable<boolean>;
  activeChannelData: Readable<Channel>;
  recordingChannels: Readable<Channel[]>;
  setActiveChannel: (channel: number) => Promise<void>;
  setVoltage: (channel: number, voltage: number, current: number) => Promise<void>;
  setCurrent: (channel: number, voltage: number, current: number) => Promise<void>;
  setOutput: (channel: number, enabled: boolean) => Promise<void>;
  startRecording: (channel: number) => void;
  stopRecording: (channel: number) => void;
  clearRecording: (channel: number) => void;
  reset: () => void;
  destroy: () => void;
} {
  const { serial, packets } = options;

  const getInitialState = (): Channel[] =>
    Array(6)
      .fill(null)
      .map((_, i) => ({
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
        targetPower: 0,
        recording: false,
        waveformData: [],
      }));

  const channels = writable(getInitialState());
  const activeChannel = writable(0);
  const waitingSynthesize = writable(true);

  function markChannelsOffline(): void {
    channels.update((chs) =>
      chs.map((channel) => ({
        ...channel,
        online: false,
        power: 0,
        current: 0,
        voltage: 0,
      }))
    );
  }

  function validateChannelData(channelData: ChannelUpdate): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    let isValid = true;

    if (typeof channelData.online === 'boolean') {
      // ok
    } else if (channelData.online !== 0 && channelData.online !== 1) {
      warnings.push(`Invalid online flag: ${channelData.online} (should be 0, 1, true, or false)`);
      isValid = false;
    }

    const temperature = typeof channelData.temperature === 'number' ? channelData.temperature : Number.NaN;
    if (!Number.isFinite(temperature) || temperature < -10 || temperature > 85) {
      warnings.push(
        `Temperature out of range: ${Number.isFinite(temperature) ? temperature.toFixed(1) : 'NaN'}°C (should be -10°C to 85°C)`
      );
      isValid = false;
    }

    const voltage = typeof channelData.voltage === 'number' ? channelData.voltage : Number.NaN;
    if (!Number.isFinite(voltage) || voltage < 0 || voltage > 50) {
      warnings.push(`Voltage out of range: ${Number.isFinite(voltage) ? voltage.toFixed(3) : 'NaN'}V (should be 0V to 50V)`);
      isValid = false;
    }

    const current = typeof channelData.current === 'number' ? channelData.current : Number.NaN;
    if (!Number.isFinite(current) || current < 0 || current > 10) {
      warnings.push(`Current out of range: ${Number.isFinite(current) ? current.toFixed(3) : 'NaN'}A (should be 0A to 10A)`);
      isValid = false;
    }

    const validTypes = ['Node', 'P905', 'P906', 'L1060', 'Unknown'];
    if (typeof channelData.machineType !== 'string' || !validTypes.includes(channelData.machineType)) {
      warnings.push(`Invalid machine type: ${String(channelData.machineType)}`);
      isValid = false;
    }

    return { isValid, warnings };
  }

  function mergeChannelUpdate(chs: Channel[], index: number, update: ChannelUpdate): void {
    const previous = chs[index];
    const validation = validateChannelData(update);
    const channelData = validation.isValid ? update : { ...update, online: false };
    chs[index] = { ...previous, ...channelData, waveformData: previous.waveformData };
  }

  function handleSynthesize(packet: SynthesizePacket): void {
    const processed = processSynthesizePacket(packet);
    if (!processed) {
      debugError('channel-store', 'Processing failed for SYNTHESIZE packet');
      markChannelsOffline();
      waitingSynthesize.set(false);
      return;
    }

    channels.update((chs) => {
      processed.forEach((data, i) => {
        mergeChannelUpdate(chs, i, data);
      });
      return chs;
    });

    waitingSynthesize.set(false);
  }

  function handleWave(packet: WavePacket): void {
    const channel = packet.data.channel;

    channels.update((chs) => {
      const ch = chs[channel];
      if (!ch || !ch.recording) return chs;

      if (!ch.runningTimeUs) {
        ch.runningTimeUs = 0;
      }

      const samplesPerGroup = packet.size === 126 ? 2 : 4;
      const newPoints: WaveformPoint[] = [];

      packet.data.groups.forEach((group) => {
        const groupElapsedTimeUs = group.timestamp / 10;
        const timePerSampleUs = groupElapsedTimeUs / samplesPerGroup;

        for (let i = 0; i < samplesPerGroup; i++) {
          const item = group.items[i];
          if (!item) break;

          const sampleTimeUs = (ch.runningTimeUs || 0) + i * timePerSampleUs;
          newPoints.push({
            timestamp: sampleTimeUs / 1000,
            voltage: item.voltage,
            current: item.current,
          });
        }

        ch.runningTimeUs = (ch.runningTimeUs || 0) + groupElapsedTimeUs;
      });

      if (!ch.waveformData) {
        ch.waveformData = [];
      }
      ch.waveformData.push(...newPoints);

      return chs;
    });
  }

  function handleUpdateChannel(packet: UpdateChannelPacket): void {
    activeChannel.set(packet.data.targetChannel);
  }

  function handleAddress(packet: AddressPacket): void {
    const processed = processAddressPacket(packet);
    if (!processed) return;

    channels.update((chs) => {
      processed.forEach((entry) => {
        const previous = chs[entry.channel];
        if (!previous) return;
        chs[entry.channel] = { ...previous, address: entry.address };
      });
      return chs;
    });
  }

  function handleMachine(packet: MachinePacket): void {
    const processed = processMachinePacket(packet);
    if (processed) {
      serial.setDeviceType(processed);
    }
  }

  const unsubscribes = [
    packets.onSynthesize.subscribe(handleSynthesize),
    packets.onWave.subscribe(handleWave),
    packets.onUpdateChannel.subscribe(handleUpdateChannel),
    packets.onAddress.subscribe(handleAddress),
    packets.onMachine.subscribe(handleMachine),
  ];

  function updateTargetValues(chs: Channel[], channel: number, voltage: number, current: number): void {
    chs[channel].targetVoltage = voltage;
    chs[channel].targetCurrent = current;
    chs[channel].targetPower = voltage * current;
  }

  async function setActiveChannel(channel: number): Promise<void> {
    const packet = createSetChannelPacket(channel);
    await serial.sendPacket(packet);
    activeChannel.set(channel);
  }

  async function setVoltage(channel: number, voltage: number, current: number): Promise<void> {
    const packet = createSetVoltagePacket(channel, voltage, current);
    await serial.sendPacket(packet);

    channels.update((chs) => {
      updateTargetValues(chs, channel, voltage, current);
      return chs;
    });
  }

  async function setCurrent(channel: number, voltage: number, current: number): Promise<void> {
    const packet = createSetCurrentPacket(channel, voltage, current);
    await serial.sendPacket(packet);

    channels.update((chs) => {
      updateTargetValues(chs, channel, voltage, current);
      return chs;
    });
  }

  async function setOutput(channel: number, enabled: boolean): Promise<void> {
    const packet = createSetOutputPacket(channel, enabled);
    await serial.sendPacket(packet);
  }

  function startRecording(channel: number): void {
    channels.update((chs) => {
      chs[channel].recording = true;
      chs[channel].waveformData = [];
      chs[channel].runningTimeUs = 0;
      return chs;
    });
  }

  function stopRecording(channel: number): void {
    channels.update((chs) => {
      chs[channel].recording = false;
      return chs;
    });
  }

  function clearRecording(channel: number): void {
    channels.update((chs) => {
      chs[channel].waveformData = [];
      return chs;
    });
  }

  function reset(): void {
    channels.set(getInitialState());
    activeChannel.set(0);
    waitingSynthesize.set(true);
  }

  const activeChannelData = derived([channels, activeChannel], ([$channels, $activeChannel]) => $channels[$activeChannel]);
  const recordingChannels = derived(channels, ($channels) => $channels.filter((ch) => ch.recording));

  function destroy(): void {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  return {
    channels,
    activeChannel: derived(activeChannel, ($active) => $active),
    waitingSynthesize: derived(waitingSynthesize, ($waiting) => $waiting),
    activeChannelData,
    recordingChannels,
    setActiveChannel,
    setVoltage,
    setCurrent,
    setOutput,
    startRecording,
    stopRecording,
    clearRecording,
    reset,
    destroy,
  };
}
