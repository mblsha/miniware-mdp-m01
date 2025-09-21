/* eslint-disable @typescript-eslint/no-misused-new */
// Type definitions for Kaitai Struct parser

declare module 'kaitai-struct/KaitaiStream' {
  export default class KaitaiStream {
    constructor(buffer: ArrayBuffer | Uint8Array);
    isEof(): boolean;
    pos: number;
    size: number;
    readU1(): number;
    readU2le(): number;
    readU4le(): number;
    readS1(): number;
    readS2le(): number;
    readS4le(): number;
    readBytes(length: number): Uint8Array;
    ensureFixedContents(expected: Uint8Array): void;
  }
}

// MiniwareMdpM01 parser types
export interface MiniwareMdpM01 {
  new (io: any): MiniwareMdpM01;
  packets: MiniwareMdpM01Packet[];
}

export interface MiniwareMdpM01Packet {
  packType: number;
  size: number;
  channel: number;
  checksum: number;
  data: any;
}

export interface SynthesizeData {
  channels: SynthesizeChannel[];
  channel: number;
  dummy: number;
}

export interface SynthesizeChannel {
  num: number;
  outVoltageRaw: number;
  outCurrentRaw: number;
  inVoltageRaw: number;
  inCurrentRaw: number;
  setVoltageRaw: number;
  setCurrentRaw: number;
  tempRaw: number;
  online: number;
  type: number;
  lock: number;
  statusLoad: number;
  statusPsu?: number;
  outputOn: number;
  color: Uint8Array;
  error: number;
  end: Uint8Array;
  outVoltage: number;
  outCurrent: number;
  inVoltage: number;
  inCurrent: number;
  setVoltage: number;
  setCurrent: number;
  temperature: number;
}

export interface WaveData {
  groups: WaveGroup[];
  channel: number;
}

export interface WaveGroup {
  timestamp: number;
  items: WaveItem[];
}

export interface WaveItem {
  voltageRaw: number;
  currentRaw: number;
  voltage: number;
  current: number;
}

export interface AddressData {
  addresses: AddressEntry[];
}

export interface AddressEntry {
  address: Uint8Array;
  frequencyOffset: number;
  frequency: number;
  isEmpty: boolean;
}

export interface MachineData {
  channel: number;
  dummy: number;
  machineTypeRaw: number;
}

export interface UpdateChannelData {
  targetChannel: number;
}

export interface SetIsOutputData {
  isOutputRaw: number;
  isOutputOn: boolean;
}

export interface SetVData {
  voltage: number;
  current: number;
}

export interface SetIData {
  voltage: number;
  current: number;
}

export interface SetAddrData {
  address: Uint8Array;
  frequencyOffset: number;
}

export interface SetAllAddrData {
  addresses: AddressEntry[];
}

export interface RgbData {
  rgbRaw: number;
  isRgbOn: boolean;
}

export interface EmptyPacketData {
  channel: number;
  dummy: number;
}