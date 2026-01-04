export type PacketHandler = (packet: number[]) => void;
export type RawDataHandler = (chunk: Uint8Array) => void;

export type SerialConfig = {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd';
  flowControl: 'none' | 'hardware';
};
