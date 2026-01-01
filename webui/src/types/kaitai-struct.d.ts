// Ambient module declarations for Kaitai runtime imports used in the web UI.

declare module 'kaitai-struct' {
  export type KaitaiStreamConstructor = new (
    buffer: ArrayBuffer | Uint8Array,
    offset?: number
  ) => unknown;

  const kaitaiRuntime: {
    KaitaiStream?: KaitaiStreamConstructor;
    default?: { KaitaiStream?: KaitaiStreamConstructor } | KaitaiStreamConstructor;
  };

  export const KaitaiStream: KaitaiStreamConstructor;
  export default kaitaiRuntime;
}

declare module 'kaitai-struct/KaitaiStream.js' {
  const KaitaiStreamExport: new (buffer: ArrayBuffer | Uint8Array, offset?: number) => unknown;
  export default KaitaiStreamExport;
}
