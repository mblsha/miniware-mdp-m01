import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Note: Component mocking is done individually in test files where needed

// Mock kaitai-wrapper globally to ensure consistent behavior
vi.mock('$lib/kaitai-wrapper.js', () => {
  const PackType = {
    SYNTHESIZE: 0x11,
    WAVE: 0x12,
    ADDR: 0x13,
    UPDAT_CH: 0x14,
    MACHINE: 0x15,
    SET_ISOUTPUT: 0x16,
    GET_ADDR: 0x17,
    SET_ADDR: 0x18,
    SET_CH: 0x19,
    SET_V: 0x1a,
    SET_I: 0x1b,
    SET_ALL_ADDR: 0x1c,
    START_AUTO_MATCH: 0x1d,
    STOP_AUTO_MATCH: 0x1e,
    RESET_TO_DFU: 0x1f,
    RGB: 0x20,
    GET_MACHINE: 0x21,
    HEARTBEAT: 0x22,
    ERR_240: 0x23,
    // Legacy names
    PACK_HEARTBEAT: 0x22,
    PACK_SET_CH: 0x19,
    PACK_SET_ISOUTPUT: 0x16,
    PACK_SET_V: 0x1a,
    PACK_SET_I: 0x1b,
    PACK_SET_ADDR: 0x18,
    PACK_SET_ALL_ADDR: 0x1c
  };

  class MockKaitaiStream {
    constructor(buffer) {
      this.buffer = buffer.buffer instanceof ArrayBuffer ? buffer.buffer : buffer;
      this.pos = 0;
      this.view = new DataView(this.buffer);
    }
    
    readU1() {
      return this.view.getUint8(this.pos++);
    }
    
    readU2le() {
      const val = this.view.getUint16(this.pos, true);
      this.pos += 2;
      return val;
    }
    
    readU4le() {
      const val = this.view.getUint32(this.pos, true);
      this.pos += 4;
      return val;
    }
    
    readBytes(n) {
      const bytes = new Uint8Array(this.buffer, this.pos, n);
      this.pos += n;
      return bytes;
    }
  }

  class MockMiniwareMdpM01 {
    constructor(stream) {
      this._io = stream;
      this.packets = [];
      
      try {
        // Read packet header
        const magic1 = stream.readU1();
        const magic2 = stream.readU1();
        
        if (magic1 === 0x5A && magic2 === 0x5A) {
          const packType = stream.readU1();
          const size = stream.readU1();
          const dataSize = size - 4;
          
          // Read channel and dummy
          const channel = stream.readU1();
          const dummy = stream.readU1();
          
          // Create mock packet data based on type
          let data;
          
          switch (packType) {
            case PackType.SYNTHESIZE:
              data = this._mockSynthesizeData(stream, dataSize - 2);
              break;
            case PackType.WAVE:
              data = this._mockWaveData(stream, dataSize - 2, size);
              break;
            case PackType.MACHINE:
              data = this._mockMachineData(stream);
              break;
            case PackType.ADDR:
              data = this._mockAddressData(stream);
              break;
            default:
              data = { channel, dummy };
          }
          
          this.packets.push({
            packType,
            size,
            data
          });
        }
      } catch (e) {
        // Silently fail for invalid data
      }
    }
    
    _mockSynthesizeData(stream, dataSize) {
      const channels = [];
      
      for (let i = 0; i < 6; i++) {
        channels.push({
          num: i,
          outVoltage: 3.3,
          outCurrent: 0.5,
          inVoltage: 5.0,
          inCurrent: 0.4,
          setVoltage: 3.3,
          setCurrent: 0.5,
          temperature: 25.5,
          online: i === 0 ? 1 : 0,
          type: 2,
          outputOn: 1
        });
      }
      
      // Consume remaining bytes
      if (stream.pos < stream.buffer.byteLength) {
        stream.readBytes(Math.min(dataSize, stream.buffer.byteLength - stream.pos));
      }
      
      return { channel: 0, dummy: 0, channels };
    }
    
    _mockWaveData(stream, dataSize, packetSize) {
      const groups = [];
      const groupSize = packetSize === 126 ? 2 : 4;
      
      for (let i = 0; i < 10; i++) {
        const items = [];
        for (let j = 0; j < groupSize; j++) {
          items.push({ voltage: 3.3, current: 0.5 });
        }
        groups.push({ timestamp: i * 100, items });
      }
      
      // Consume remaining bytes
      if (stream.pos < stream.buffer.byteLength) {
        stream.readBytes(Math.min(dataSize, stream.buffer.byteLength - stream.pos));
      }
      
      return { channel: 0, dummy: 0, groups, groupSize };
    }
    
    _mockMachineData(stream) {
      const machineTypeRaw = stream.pos < stream.buffer.byteLength ? stream.readU1() : 0x10;
      return { channel: 0, dummy: 0, machineTypeRaw };
    }
    
    _mockAddressData(stream) {
      const addresses = [];
      
      for (let i = 0; i < 6; i++) {
        addresses.push({
          address: [1, 2, 3, 4, 5],
          frequencyOffset: 10
        });
      }
      
      // Consume remaining bytes
      const remainingBytes = stream.buffer.byteLength - stream.pos;
      if (remainingBytes > 0) {
        stream.readBytes(remainingBytes);
      }
      
      return { channel: 0, dummy: 0, addresses };
    }
  }
  
  MockMiniwareMdpM01.PackType = PackType;
  
  return {
    KaitaiStream: MockKaitaiStream,
    MiniwareMdpM01: MockMiniwareMdpM01
  };
});

// Add CSS support for computed styles in tests
// Mock getComputedStyle to return proper CSS values for grid layout
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = vi.fn((element) => {
  const styles = originalGetComputedStyle(element);
  
  // Check if element has grid-related classes or styles
  if (element.classList?.contains('channel-grid') || 
      element.className?.includes('channel-grid')) {
    return {
      ...styles,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    };
  }
  
  return styles;
});

// Mock Web Serial API globally
global.navigator.serial = {
  requestPort: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Mock for ResizeObserver (needed for uPlot)
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock for requestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 0));
global.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));

// Mock for matchMedia (needed by uPlot)
global.matchMedia = vi.fn((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));