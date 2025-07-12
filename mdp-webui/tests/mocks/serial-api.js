import { vi } from 'vitest';

export class MockReadableStream {
  constructor() {
    this.locked = false;
    this.reader = null;
    this.controller = null;
  }

  getReader() {
    if (this.locked) {
      throw new Error('Stream is locked');
    }
    this.locked = true;
    this.reader = new MockReader(this);
    return this.reader;
  }

  pipeTo() {
    return Promise.resolve();
  }
}

export class MockWritableStream {
  constructor() {
    this.locked = false;
    this.writer = null;
    this.writtenData = [];
  }

  getWriter() {
    if (this.locked) {
      throw new Error('Stream is locked');
    }
    this.locked = true;
    this.writer = new MockWriter(this);
    return this.writer;
  }
}

export class MockReader {
  constructor(stream) {
    this.stream = stream;
    this.dataQueue = [];
    this.closed = false;
    this.readCount = 0;
    this.pendingRead = null;
  }

  async read() {
    if (this.closed) {
      return { done: true };
    }
    
    if (this.dataQueue.length > 0) {
      return { value: this.dataQueue.shift(), done: false };
    }
    
    // Store the promise resolver so we can trigger it when data arrives
    return new Promise((resolve) => {
      this.pendingRead = resolve;
    });
  }

  async cancel() {
    this.closed = true;
    this.stream.locked = false;
    if (this.pendingRead) {
      this.pendingRead({ done: true });
      this.pendingRead = null;
    }
    return Promise.resolve();
  }

  // Helper method to push data for testing
  pushData(data) {
    this.dataQueue.push(data);
    // If there's a pending read, resolve it immediately
    if (this.pendingRead) {
      this.pendingRead({ value: this.dataQueue.shift(), done: false });
      this.pendingRead = null;
    }
  }
}

export class MockWriter {
  constructor(stream) {
    this.stream = stream;
    this.closed = false;
  }

  async write(data) {
    if (this.closed) {
      throw new Error('Writer is closed');
    }
    this.stream.writtenData.push(data);
    return Promise.resolve();
  }

  async close() {
    this.closed = true;
    this.stream.locked = false;
    return Promise.resolve();
  }
}

export class MockSerialPort {
  constructor() {
    this.readable = new MockReadableStream();
    this.writable = new MockWritableStream();
    this.opened = false;
    this.openPromise = Promise.resolve();
    this.closePromise = Promise.resolve();
  }

  async open(config) {
    if (this.opened) {
      throw new Error('Port is already open');
    }
    await this.openPromise;
    this.opened = true;
    this.config = config;
    // Immediate completion for test environment (no delays needed)
    // await new Promise(resolve => setTimeout(resolve, 0));
    return Promise.resolve();
  }

  async close() {
    if (!this.opened) {
      throw new Error('Port is not open');
    }
    await this.closePromise;
    this.opened = false;
    return Promise.resolve();
  }

  // Test helpers
  simulateData(data) {
    const reader = this.readable.reader;
    if (reader) {
      // Add data to the reader's dataQueue for our test-optimized readLoop
      reader.dataQueue.push(new Uint8Array(data));
    }
  }

  getWrittenData() {
    return this.writable.writtenData;
  }

  simulateDisconnect() {
    if (this.readable.reader) {
      this.readable.reader.closed = true;
      if (this.readable.reader.pendingRead) {
        this.readable.reader.pendingRead({ done: true });
      }
    }
  }
}

export function createMockSerial() {
  const ports = [];
  let nextPort = null;
  
  const mockSerial = {
    requestPort: vi.fn(async () => {
      if (nextPort) {
        const port = nextPort;
        nextPort = null;
        return port;
      }
      const port = new MockSerialPort();
      ports.push(port);
      return port;
    }),
    
    // Test helper to set the next port to be returned
    setNextPort: (port) => {
      nextPort = port;
    },
    
    // Test helper to get all created ports
    getPorts: () => ports,
    
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  
  return mockSerial;
}