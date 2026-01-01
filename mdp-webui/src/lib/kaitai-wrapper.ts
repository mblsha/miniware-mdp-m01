import type { MiniwareMdpM01Constructor } from './types/kaitai';

type KaitaiStreamConstructor = new (buffer: ArrayBuffer | Uint8Array, offset?: number) => unknown;
type KaitaiRuntimeModule = {
  KaitaiStream?: KaitaiStreamConstructor;
  default?: { KaitaiStream?: KaitaiStreamConstructor } | KaitaiStreamConstructor;
};
type GlobalScope = typeof globalThis & {
  KaitaiStream?: KaitaiStreamConstructor;
  MiniwareMdpM01?: MiniwareMdpM01Constructor;
  self?: typeof globalThis;
};
type BrowserWindow = Window & {
  KaitaiStream?: KaitaiStreamConstructor;
  MiniwareMdpM01?: MiniwareMdpM01Constructor;
};

// Wrapper to expose Kaitai runtime for both browser and Node environments
const isBrowser =
  typeof window !== 'undefined' &&
  typeof window.document !== 'undefined' &&
  typeof window.navigator !== 'undefined';

let KaitaiStreamImpl: KaitaiStreamConstructor | undefined;
let MiniwareMdpM01Impl: MiniwareMdpM01Constructor | undefined;

const globalScope = globalThis as GlobalScope;

if (isBrowser) {
  const browserWindow = window as BrowserWindow;
  await import('kaitai-struct/KaitaiStream.js');
  await import('./kaitai/MiniwareMdpM01.js');
  KaitaiStreamImpl = browserWindow.KaitaiStream;
  MiniwareMdpM01Impl = browserWindow.MiniwareMdpM01;
} else {
  const kaitaiRuntime = (await import('kaitai-struct')) as KaitaiRuntimeModule;
  const runtime =
    kaitaiRuntime.KaitaiStream ??
    kaitaiRuntime.default?.KaitaiStream ??
    kaitaiRuntime.default ??
    kaitaiRuntime;
  KaitaiStreamImpl = runtime as KaitaiStreamConstructor;

  if (!globalScope.KaitaiStream) {
    globalScope.KaitaiStream = KaitaiStreamImpl;
  }

  if (typeof globalScope.self === 'undefined') {
    globalScope.self = globalScope;
  }

  await import('./kaitai/MiniwareMdpM01.js');
  MiniwareMdpM01Impl = globalScope.MiniwareMdpM01;
}

if (!KaitaiStreamImpl || !MiniwareMdpM01Impl) {
  throw new Error('Unable to initialize Kaitai runtime');
}

export const KaitaiStream = KaitaiStreamImpl;
export const MiniwareMdpM01 = MiniwareMdpM01Impl;
