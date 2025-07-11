// Wrapper to handle Kaitai's UMD module format in Vite

// Load KaitaiStream
const KaitaiStreamModule = await import('kaitai-struct/KaitaiStream.js');
const KaitaiStream = KaitaiStreamModule.default || KaitaiStreamModule.KaitaiStream || KaitaiStreamModule;

// Load MiniwareMdpM01 with KaitaiStream dependency
const MiniwareMdpM01Module = await import('./kaitai/MiniwareMdpM01.js');
const MiniwareMdpM01 = MiniwareMdpM01Module.default || MiniwareMdpM01Module.MiniwareMdpM01 || MiniwareMdpM01Module;

export { KaitaiStream, MiniwareMdpM01 };