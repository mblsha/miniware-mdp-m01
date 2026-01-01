import { createSignal, type Signal, type Unsubscribe } from '../util/signal';
import type { Transport } from '../transport';
import { PackType, decodePacket, isAddressPacket, isMachinePacket, isSynthesizePacket, isUpdateChannelPacket, isWavePacket } from '../protocol/packet-decoder';
import type {
  AddressPacket,
  DecodedPacket,
  MachinePacket,
  SynthesizePacket,
  UpdateChannelPacket,
  WavePacket
} from '../protocol/packet-decoder';

export type PacketBus = {
  start: () => void;
  stop: () => void;
  onRawPacket: Signal<number[]>;
  onDecodedPacket: Signal<DecodedPacket>;
  onSynthesize: Signal<SynthesizePacket>;
  onWave: Signal<WavePacket>;
  onAddress: Signal<AddressPacket>;
  onMachine: Signal<MachinePacket>;
  onUpdateChannel: Signal<UpdateChannelPacket>;
};

export function createPacketBus(serial: Transport): PacketBus {
  const onRawPacket = createSignal<number[]>();
  const onDecodedPacket = createSignal<DecodedPacket>();
  const onSynthesize = createSignal<SynthesizePacket>();
  const onWave = createSignal<WavePacket>();
  const onAddress = createSignal<AddressPacket>();
  const onMachine = createSignal<MachinePacket>();
  const onUpdateChannel = createSignal<UpdateChannelPacket>();

  let started = false;
  let unsubscribes: Unsubscribe[] = [];

  const handlePacket = (packet: number[]): void => {
    onRawPacket.emit(packet);

    const decoded = decodePacket(packet);
    if (!decoded) return;

    onDecodedPacket.emit(decoded);

    if (isSynthesizePacket(decoded)) {
      onSynthesize.emit(decoded);
      return;
    }
    if (isWavePacket(decoded)) {
      onWave.emit(decoded);
      return;
    }
    if (isAddressPacket(decoded)) {
      onAddress.emit(decoded);
      return;
    }
    if (isMachinePacket(decoded)) {
      onMachine.emit(decoded);
      return;
    }
    if (isUpdateChannelPacket(decoded)) {
      onUpdateChannel.emit(decoded);
    }
  };

  const start = (): void => {
    if (started) return;
    started = true;

    unsubscribes = [
      serial.registerPacketHandler(PackType.SYNTHESIZE, handlePacket),
      serial.registerPacketHandler(PackType.WAVE, handlePacket),
      serial.registerPacketHandler(PackType.ADDR, handlePacket),
      serial.registerPacketHandler(PackType.UPDAT_CH, handlePacket),
      serial.registerPacketHandler(PackType.MACHINE, handlePacket),
      serial.registerPacketHandler(PackType.ERR_240, handlePacket)
    ];
  };

  const stop = (): void => {
    if (!started) return;
    started = false;
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    unsubscribes = [];
  };

  return {
    start,
    stop,
    onRawPacket,
    onDecodedPacket,
    onSynthesize,
    onWave,
    onAddress,
    onMachine,
    onUpdateChannel
  };
}
