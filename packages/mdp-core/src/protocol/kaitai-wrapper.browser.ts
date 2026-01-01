// Browser-friendly Kaitai wrapper that mirrors the legacy Web UI shim.
const kaitaiRuntime = await import('kaitai-struct');
const runtime =
  kaitaiRuntime.KaitaiStream ??
  kaitaiRuntime.default?.KaitaiStream ??
  kaitaiRuntime.default ??
  kaitaiRuntime;

const KaitaiStreamImpl = runtime as typeof window.KaitaiStream;
if (!KaitaiStreamImpl) {
  throw new Error('Unable to initialize Kaitai runtime');
}

if (!globalThis.KaitaiStream) {
  globalThis.KaitaiStream = KaitaiStreamImpl;
}

if (typeof globalThis.self === 'undefined') {
  (globalThis as typeof globalThis & { self?: typeof globalThis }).self = globalThis;
}

const kaitaiModule = await import('./kaitai/MiniwareMdpM01.js');
const MiniwareMdpM01Impl =
  kaitaiModule.MiniwareMdpM01 ??
  kaitaiModule.default ??
  globalThis.MiniwareMdpM01;
if (!MiniwareMdpM01Impl) {
  throw new Error('Unable to initialize Kaitai runtime');
}

globalThis.MiniwareMdpM01 = MiniwareMdpM01Impl;

export const KaitaiStream = KaitaiStreamImpl;
export const MiniwareMdpM01 = MiniwareMdpM01Impl;
