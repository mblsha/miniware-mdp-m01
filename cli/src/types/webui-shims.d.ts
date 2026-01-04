declare module 'kaitai-struct' {
  export const KaitaiStream: new (buffer: ArrayBuffer | Uint8Array, offset?: number) => unknown;
  const defaultExport:
    | { KaitaiStream?: new (buffer: ArrayBuffer | Uint8Array, offset?: number) => unknown }
    | (new (buffer: ArrayBuffer | Uint8Array, offset?: number) => unknown);
  export default defaultExport;
}

declare module 'kaitai-struct/KaitaiStream.js' {
  const KaitaiStream: new (buffer: ArrayBuffer | Uint8Array, offset?: number) => unknown;
  export default KaitaiStream;
}

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

interface Navigator {
  serial?: {
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
    getPorts(): Promise<SerialPort[]>;
  };
}

export {};
