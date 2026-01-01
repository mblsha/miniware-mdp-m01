import * as kaitaiRuntime from 'kaitai-struct';
import * as kaitaiModule from './kaitai/MiniwareMdpM01.js';

type KaitaiStreamConstructor = new (buffer: ArrayBuffer | Uint8Array) => unknown;

const KaitaiStream =
  (kaitaiRuntime as { KaitaiStream?: KaitaiStreamConstructor }).KaitaiStream ??
  (kaitaiRuntime as { default?: { KaitaiStream?: KaitaiStreamConstructor } }).default?.KaitaiStream ??
  (kaitaiRuntime as { default?: KaitaiStreamConstructor }).default ??
  (kaitaiRuntime as KaitaiStreamConstructor);

const MiniwareMdpM01 =
  (kaitaiModule as { MiniwareMdpM01?: unknown }).MiniwareMdpM01 ??
  (kaitaiModule as { default?: unknown }).default ??
  kaitaiModule;

export { KaitaiStream, MiniwareMdpM01 };
