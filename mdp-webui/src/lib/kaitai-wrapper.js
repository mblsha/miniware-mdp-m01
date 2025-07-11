// Wrapper to handle Kaitai's UMD module format in Vite

// Import and execute the UMD modules (they will set window.KaitaiStream and window.MiniwareMdpM01)
await import('kaitai-struct/KaitaiStream.js');
await import('./kaitai/MiniwareMdpM01.js');

// Export from window (UMD modules set these)
export const KaitaiStream = window.KaitaiStream;
export const MiniwareMdpM01 = window.MiniwareMdpM01;