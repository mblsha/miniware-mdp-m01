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

declare module 'kaitai-struct' {
  export class KaitaiStream {
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
    static byteArrayCompare(a: Uint8Array, b: number[]): number;
  }

  const defaultExport: typeof KaitaiStream | { KaitaiStream?: typeof KaitaiStream };
  export default defaultExport;
}

// MiniwareMdpM01 parser types
export interface MiniwareMdpM01 {
  packets: MiniwareMdpM01Packet[];
}

export interface MiniwareMdpM01Constructor {
  // Kaitai classes accept a stream-like object; keep loose here to avoid
  // depending on a specific KaitaiStream module format (UMD/ESM).
  new (io: unknown): MiniwareMdpM01;
}

export interface MiniwareMdpM01Packet<TData = unknown> {
  packType: number;
  size: number;
  // These exist in some mocks/test parsers but not in the generated Kaitai JS.
  channel?: number;
  checksum?: number;
  data: TData;
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
  statusLoad?: number;
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
  dummy?: number;
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
  channel?: number;
  dummy?: number;
  addresses: AddressEntry[];
}

export type AddressEntry = AddressEntryBytes | AddressEntryFields;

export interface AddressEntryBytes {
  address: Uint8Array;
  frequencyOffset: number;
  frequency?: number;
  isEmpty?: boolean;
}

export interface AddressEntryFields {
  addrByte0: number;
  addrByte1: number;
  addrByte2: number;
  addrByte3: number;
  addrByte4: number;
  frequencyOffset: number;
  frequency?: number;
  isEmpty?: boolean;
}

export interface MachineData {
  channel: number;
  dummy: number;
  machineTypeRaw: number;
  hasLcd?: boolean;
  machineName?: string;
}

export interface UpdateChannelData {
  channel: number;
  dummy: number;
  targetChannel: number;
}

export interface SetIsOutputData {
  channel: number;
  dummy: number;
  outputState: number;
  isOutputOn: boolean;
}

export interface SetVData {
  channel: number;
  dummy: number;
  voltageRaw: number;
  currentRaw: number;
  voltage: number;
  current: number;
}

export interface SetIData {
  channel: number;
  dummy: number;
  voltageRaw: number;
  currentRaw: number;
  voltage: number;
  current: number;
}

export interface SetAddrData {
  channel: number;
  dummy: number;
  addrByte0: number;
  addrByte1: number;
  addrByte2: number;
  addrByte3: number;
  addrByte4: number;
  frequencyOffset: number;
  frequency?: number;
  isEmpty?: boolean;
}

export interface SetAllAddrData {
  channel: number;
  dummy: number;
  addresses: AddressEntry[];
}

export interface RgbData {
  channel: number;
  dummy: number;
  rgbState: number;
  isRgbOn: boolean;
}

export interface EmptyPacketData {
  channel: number;
  dummy: number;
}
