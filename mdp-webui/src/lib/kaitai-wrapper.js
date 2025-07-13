// Wrapper to handle Kaitai's UMD module format in Vite

// Import the UMD modules so they register themselves on `window`
import 'kaitai-struct/KaitaiStream.js';
import './kaitai/MiniwareMdpM01.js';

// Re-export the objects that the UMD modules attach to `window`
export const KaitaiStream = window.KaitaiStream;
export const MiniwareMdpM01 = window.MiniwareMdpM01;