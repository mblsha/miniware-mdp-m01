// Type declarations for kaitai-struct runtime used by web UI tooling.
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
    static byteArrayCompare(a: Uint8Array, b: number[]): number;
  }
}
