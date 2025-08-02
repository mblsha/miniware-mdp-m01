// Web Serial API type definitions

interface SerialPortRequestOptions {
  filters?: SerialPortFilter[];
}

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'odd';
  bufferSize?: number;
  flowControl?: 'none' | 'hardware';
}

interface SerialPort {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  getInfo(): SerialPortInfo;
}

interface Serial extends EventTarget {
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

interface Navigator {
  serial?: Serial;
}

interface ReadableStreamDefaultReader<R = any> {
  read(): Promise<ReadableStreamDefaultReadResult<R>>;
  releaseLock(): void;
  readonly closed: Promise<void>;
  cancel(reason?: any): Promise<void>;
}

interface ReadableStreamDefaultReadResult<T> {
  done: boolean;
  value: T;
}

interface WritableStreamDefaultWriter<W = any> {
  write(chunk: W): Promise<void>;
  close(): Promise<void>;
  abort(reason?: any): Promise<void>;
  releaseLock(): void;
  readonly closed: Promise<void>;
  readonly desiredSize: number | null;
  readonly ready: Promise<void>;
}