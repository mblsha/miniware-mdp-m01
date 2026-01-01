// Global type declarations for external libraries and browser APIs

declare global {
  interface Window {
    KaitaiStream: typeof KaitaiStream;
    MiniwareMdpM01: typeof MiniwareMdpM01;
  }

  // AMD/UMD module definition
  declare function define(deps: string[], factory: (...args: unknown[]) => unknown): void;
  declare function define(factory: () => unknown): void;
  declare namespace define {
    let amd: Record<string, unknown>;
  }
}

// Kaitai Struct types
declare class KaitaiStream {
  constructor(buffer: ArrayBuffer | Uint8Array, offset?: number);
  // Add other methods as needed
}

// This is an ambient declaration for a global runtime class
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare class MiniwareMdpM01 {
  constructor(stream: KaitaiStream);
  packets: Array<{
    packType: number;
    size: number;
    channel: number;
    data: unknown;
  }>;
  static readonly PackType: {
    SYNTHESIZE: number;
    WAVE: number;
    ADDR: number;
    UPDAT_CH: number;
    MACHINE: number;
    SET_ISOUTPUT: number;
    ERR_240: number;
  };
}

// Web Serial API types (for modern browsers)
interface SerialPortRequestOptions {
  filters?: Array<{
    usbVendorId?: number;
    usbProductId?: number;
  }>;
}

interface SerialPort {
  open(options: {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'odd';
    bufferSize?: number;
    flowControl?: 'none' | 'hardware';
  }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}

declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
      getPorts(): Promise<SerialPort[]>;
    };
  }
}

export {};
