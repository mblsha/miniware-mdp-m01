// Global type declarations for external libraries and browser APIs

declare global {
  interface Window {
    KaitaiStream: any;
    MiniwareMdpM01: any;
  }

  // AMD/UMD module definition
  declare function define(deps: string[], factory: (...args: any[]) => any): void;
  declare function define(factory: () => any): void;
  declare namespace define {
    var amd: any;
  }
}

// Kaitai Struct types
declare module 'kaitai-struct/KaitaiStream.js' {
  export default class KaitaiStream {
    constructor(buffer: ArrayBuffer | Uint8Array, offset?: number);
    // Add other methods as needed
  }
}

// Web Serial API types (for modern browsers)
declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: any): Promise<any>;
      getPorts(): Promise<any[]>;
    };
  }
}

export {};
