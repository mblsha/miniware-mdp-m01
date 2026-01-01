import type { MiniwareMdpM01Constructor } from './types/kaitai';

type KaitaiStreamConstructor = new (buffer: ArrayBuffer | Uint8Array) => unknown;
type KaitaiGlobal = {
  KaitaiStream?: KaitaiStreamConstructor;
  MiniwareMdpM01?: MiniwareMdpM01Constructor;
  self?: typeof globalThis;
};

// Browser-friendly Kaitai wrapper that mirrors the legacy Web UI shim.
const globalScope = globalThis as unknown as KaitaiGlobal;
const kaitaiRuntime = await import('kaitai-struct');
const runtime =
  (kaitaiRuntime as { KaitaiStream?: KaitaiStreamConstructor }).KaitaiStream ??
  (kaitaiRuntime as { default?: { KaitaiStream?: KaitaiStreamConstructor } }).default?.KaitaiStream ??
  (kaitaiRuntime as { default?: KaitaiStreamConstructor }).default ??
  kaitaiRuntime;

const KaitaiStreamImpl = runtime as KaitaiStreamConstructor;
if (!KaitaiStreamImpl) {
  throw new Error('Unable to initialize Kaitai runtime');
}

if (!globalScope.KaitaiStream) {
  globalScope.KaitaiStream = KaitaiStreamImpl;
}

if (typeof globalScope.self === 'undefined') {
  globalScope.self = globalThis;
}

const kaitaiModule = await import('./kaitai/MiniwareMdpM01.js');
const MiniwareMdpM01Impl =
  (kaitaiModule as { MiniwareMdpM01?: MiniwareMdpM01Constructor }).MiniwareMdpM01 ??
  (kaitaiModule as { default?: MiniwareMdpM01Constructor }).default ??
  globalScope.MiniwareMdpM01;
if (!MiniwareMdpM01Impl) {
  throw new Error('Unable to initialize Kaitai runtime');
}

globalScope.MiniwareMdpM01 = MiniwareMdpM01Impl;

export const KaitaiStream = KaitaiStreamImpl;
export const MiniwareMdpM01 = MiniwareMdpM01Impl;
