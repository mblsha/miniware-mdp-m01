import * as kaitaiRuntime from 'kaitai-struct';
import * as kaitaiModule from './kaitai/MiniwareMdpM01.js';
import type { MiniwareMdpM01Constructor } from './types/kaitai';

type KaitaiStreamConstructor = new (buffer: ArrayBuffer | Uint8Array) => unknown;

const KaitaiStream =
  (kaitaiRuntime as unknown as { KaitaiStream?: KaitaiStreamConstructor }).KaitaiStream ??
  (kaitaiRuntime as unknown as { default?: { KaitaiStream?: KaitaiStreamConstructor } }).default?.KaitaiStream ??
  (kaitaiRuntime as unknown as { default?: KaitaiStreamConstructor }).default ??
  (kaitaiRuntime as unknown as KaitaiStreamConstructor);

const MiniwareMdpM01 = (
  (kaitaiModule as { MiniwareMdpM01?: MiniwareMdpM01Constructor }).MiniwareMdpM01 ??
  (kaitaiModule as { default?: MiniwareMdpM01Constructor }).default ??
  kaitaiModule
) as MiniwareMdpM01Constructor;

export { KaitaiStream, MiniwareMdpM01 };
