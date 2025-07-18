// TypeScript declarations for generated MiniwareMdpM01.js
// This is a generated file! Please edit source .ksy file and use kaitai-struct-compiler to rebuild

declare module './MiniwareMdpM01.js' {
  // Enum types
  export enum L1060Type {
    CC = 0,
    CV = 1,
    CR = 2,
    CP = 3
  }

  export enum P906Type {
    OFF = 0,
    CC = 1,
    CV = 2,
    ON = 3
  }

  export enum PackType {
    SYNTHESIZE = 17,
    WAVE = 18,
    ADDR = 19,
    UPDAT_CH = 20,
    MACHINE = 21,
    SET_ISOUTPUT = 22,
    GET_ADDR = 23,
    SET_ADDR = 24,
    SET_CH = 25,
    SET_V = 26,
    SET_I = 27,
    SET_ALL_ADDR = 28,
    START_AUTO_MATCH = 29,
    STOP_AUTO_MATCH = 30,
    RESET_TO_DFU = 31,
    RGB = 32,
    GET_MACHINE = 33,
    HEARTBEAT = 34,
    ERR_240 = 35
  }

  export enum MachineType {
    NODE = 0,
    P905 = 1,
    P906 = 2,
    L1060 = 3
  }

  // Base interface for Kaitai objects
  interface KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
  }

  // Main MiniwareMdpM01 class
  export class MiniwareMdpM01 implements KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
    packets: Packet[];

    constructor(_io: any, _parent?: any, _root?: any);

    // Static enum properties
    static L1060Type: typeof L1060Type;
    static P906Type: typeof P906Type;
    static PackType: typeof PackType;
    static MachineType: typeof MachineType;

    // Nested classes
    static SetIsoutput: typeof SetIsoutput;
    static Rgb: typeof Rgb;
    static UpdatCh: typeof UpdatCh;
    static SetAllAddr: typeof SetAllAddr;
    static Synthesize: typeof Synthesize;
    static Wave: typeof Wave;
    static Machine: typeof Machine;
    static SetVoltageCurrent: typeof SetVoltageCurrent;
    static Addr: typeof Addr;
    static SetAddr: typeof SetAddr;
    static EmptyPacket: typeof EmptyPacket;
    static Packet: typeof Packet;
  }

  // SetIsoutput class
  export class SetIsoutput implements KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
    channel: number;
    dummy: number;
    outputState: number;

    constructor(_io: any, _parent: any, _root: any);
    get isOutputOn(): boolean;
  }

  // Rgb class
  export class Rgb implements KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
    channel: number;
    dummy: number;
    rgbState: number;

    constructor(_io: any, _parent: any, _root: any);
    get isRgbOn(): boolean;
  }

  // UpdatCh class
  export class UpdatCh implements KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
    channel: number;
    dummy: number;
    targetChannel: number;

    constructor(_io: any, _parent: any, _root: any);
  }

  // SetAllAddr class
  export class SetAllAddr implements KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
    channel: number;
    dummy: number;
    addresses: SetAllAddr.AddressEntry[];

    constructor(_io: any, _parent: any, _root: any);
  }

  export namespace SetAllAddr {
    export class AddressEntry implements KaitaiObject {
      _io: any;
      _parent: any;
      _root: any;
      addrByte0: number;
      addrByte1: number;
      addrByte2: number;
      addrByte3: number;
      addrByte4: number;
      frequencyOffset: number;

      constructor(_io: any, _parent: any, _root: any);
      get address(): Uint8Array;
    }
  }

  // Synthesize class
  export class Synthesize implements KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
    channel: number;
    dummy: number;
    channels: Synthesize.Chan[];

    constructor(_io: any, _parent: any, _root: any);
  }

  export namespace Synthesize {
    export class Chan implements KaitaiObject {
      _io: any;
      _parent: any;
      _root: any;
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

      constructor(_io: any, _parent: any, _root: any);
      get inVoltage(): number;
      get temperature(): number;
      get inCurrent(): number;
      get outVoltage(): number;
      get outCurrent(): number;
      get setVoltage(): number;
      get setCurrent(): number;
      get inPower(): number;
      get outPower(): number;
      get setPower(): number;
    }
  }

  // Wave class
  export class Wave implements KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
    channel: number;
    dummy: number;
    groups: Wave.Group[];

    constructor(_io: any, _parent: any, _root: any);
  }

  export namespace Wave {
    export class Item implements KaitaiObject {
      _io: any;
      _parent: any;
      _root: any;
      voltageRaw: number;
      currentRaw: number;

      constructor(_io: any, _parent: any, _root: any);
      get voltage(): number;
      get current(): number;
    }

    export class Group implements KaitaiObject {
      _io: any;
      _parent: any;
      _root: any;
      timestamp: number;
      groupSize: number;
      items: Item[];

      constructor(_io: any, _parent: any, _root: any);
    }
  }

  // Machine class
  export class Machine implements KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
    channel: number;
    dummy: number;
    type: number;

    constructor(_io: any, _parent: any, _root: any);
  }

  // SetVoltageCurrent class
  export class SetVoltageCurrent implements KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
    channel: number;
    dummy: number;
    voltageRaw: number;
    currentRaw: number;

    constructor(_io: any, _parent: any, _root: any);
    get voltage(): number;
    get current(): number;
  }

  // Addr class
  export class Addr implements KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
    channel: number;
    dummy: number;
    addresses: Addr.AddressInfo[];

    constructor(_io: any, _parent: any, _root: any);
  }

  export namespace Addr {
    export class AddressInfo implements KaitaiObject {
      _io: any;
      _parent: any;
      _root: any;
      address: Uint8Array;
      frequencyOffset: number;

      constructor(_io: any, _parent: any, _root: any);
    }
  }

  // SetAddr class
  export class SetAddr implements KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
    channel: number;
    dummy: number;
    address: Uint8Array;
    frequencyOffset: number;

    constructor(_io: any, _parent: any, _root: any);
  }

  // EmptyPacket class
  export class EmptyPacket implements KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
    channel: number;
    dummy: number;

    constructor(_io: any, _parent: any, _root: any);
  }

  // Packet class
  export class Packet implements KaitaiObject {
    _io: any;
    _parent: any;
    _root: any;
    magic: Uint8Array;
    packType: number;
    size: number;
    data: any; // Union type of all possible packet data types
    _raw_data?: Uint8Array;

    constructor(_io: any, _parent: any, _root: any);
  }

  // Default export
  const _MiniwareMdpM01: typeof MiniwareMdpM01;
  export default _MiniwareMdpM01;
}

// Global declaration for UMD module
declare global {
  interface Window {
    MiniwareMdpM01: any;
  }
}
