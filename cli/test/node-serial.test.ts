import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { NodeSerialConnection } from '../src/node-serial';

class FakeSerialPort extends EventEmitter {
  path = '';
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: string;
  rtscts?: boolean;
  autoOpen?: boolean;

  constructor() {
    super();
  }

  open(): void {
    setImmediate(() => this.emit('open'));
  }

  close(callback?: () => void): void {
    setImmediate(() => {
      this.emit('close');
      callback?.();
    });
  }

  write(_data: Uint8Array | number[] | string, callback?: (error?: Error) => void): void {
    setImmediate(() => callback?.());
  }

  flush(callback?: (error?: Error) => void): void {
    setImmediate(() => callback?.());
  }

  drain(callback?: (error?: Error) => void): void {
    setImmediate(() => callback?.());
  }

  pause(): this {
    return this;
  }

  resume(): this {
    return this;
  }
}

test('NodeSerialConnection resyncs after corrupted packet length', async () => {
  let capturedPort: FakeSerialPort | null = null;
  const factory = () => {
    capturedPort = new FakeSerialPort();
    return capturedPort;
  };

  const connection = new NodeSerialConnection({
    portPath: '/dev/null',
    serialPortFactory: factory
  });

  await connection.connect();
  assert.ok(capturedPort);

  const handlerPromise = new Promise<void>((resolve) => {
    connection.registerPacketHandler(0x11, () => resolve());
  });

  const invalidPacket = Buffer.from([0x5a, 0x5a, 0x11, 0x05, 0x00, 0x00]);
  const validPacket = Buffer.from([0x5a, 0x5a, 0x11, 0x06, 0x00, 0x00]);
  capturedPort.emit('data', Buffer.concat([invalidPacket, validPacket]));

  await handlerPromise;
  await connection.disconnect();
});

test('NodeSerialConnection skips noise before header', async () => {
  let capturedPort: FakeSerialPort | null = null;
  const factory = () => {
    capturedPort = new FakeSerialPort();
    return capturedPort;
  };

  const connection = new NodeSerialConnection({
    portPath: '/dev/null',
    serialPortFactory: factory
  });

  await connection.connect();
  assert.ok(capturedPort);

  const handlerPromise = new Promise<void>((resolve) => {
    connection.registerPacketHandler(0x11, () => resolve());
  });

  const noise = Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44]);
  const validPacket = Buffer.from([0x5a, 0x5a, 0x11, 0x06, 0x00, 0x00]);
  capturedPort.emit('data', Buffer.concat([noise, validPacket]));

  await handlerPromise;
  await connection.disconnect();
});

test('NodeSerialConnection trims oversized buffers', async () => {
  let capturedPort: FakeSerialPort | null = null;
  const factory = () => {
    capturedPort = new FakeSerialPort();
    return capturedPort;
  };

  const connection = new NodeSerialConnection({
    portPath: '/dev/null',
    serialPortFactory: factory
  });

  await connection.connect();
  assert.ok(capturedPort);

  const oversizedChunk = Buffer.alloc(4096, 0x00);
  capturedPort.emit('data', oversizedChunk);

  const bufferLength = (connection as any).receiveBuffer.length as number;
  assert.ok(bufferLength <= 2048);

  await connection.disconnect();
});

test('NodeSerialConnection waitForPacket times out when no packet arrives', async () => {
  const connection = new NodeSerialConnection({
    portPath: '/dev/null',
    serialPortFactory: () => new FakeSerialPort()
  });

  const before = Date.now();
  const result = await connection.waitForPacket(0x11, 20);
  const elapsed = Date.now() - before;

  assert.strictEqual(result, null);
  assert.ok(elapsed >= 15);
});
