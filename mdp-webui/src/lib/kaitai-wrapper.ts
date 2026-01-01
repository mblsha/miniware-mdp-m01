// Wrapper to expose Kaitai runtime for both browser and Node environments
const isBrowser =
  typeof window !== 'undefined' &&
  typeof window.document !== 'undefined' &&
  typeof window.navigator !== 'undefined';

let KaitaiStreamImpl: typeof window.KaitaiStream | undefined;
let MiniwareMdpM01Impl: typeof window.MiniwareMdpM01 | undefined;

if (isBrowser) {
  await import('kaitai-struct/KaitaiStream.js');
  await import('./kaitai/MiniwareMdpM01.js');
  KaitaiStreamImpl = window.KaitaiStream;
  MiniwareMdpM01Impl = window.MiniwareMdpM01;
} else {
  const kaitaiRuntime = await import('kaitai-struct');
  const runtime =
    kaitaiRuntime.KaitaiStream ??
    kaitaiRuntime.default?.KaitaiStream ??
    kaitaiRuntime.default ??
    kaitaiRuntime;
  KaitaiStreamImpl = runtime as typeof window.KaitaiStream;

  if (!globalThis.KaitaiStream) {
    globalThis.KaitaiStream = KaitaiStreamImpl;
  }

  if (typeof globalThis.self === 'undefined') {
    (globalThis as typeof globalThis & { self?: typeof globalThis }).self = globalThis;
  }

  await import('./kaitai/MiniwareMdpM01.js');
  MiniwareMdpM01Impl = globalThis.MiniwareMdpM01;
}

if (!KaitaiStreamImpl || !MiniwareMdpM01Impl) {
  throw new Error('Unable to initialize Kaitai runtime');
}

export const KaitaiStream = KaitaiStreamImpl;
export const MiniwareMdpM01 = MiniwareMdpM01Impl;
