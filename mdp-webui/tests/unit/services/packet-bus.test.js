import { describe, expect, it, vi } from 'vitest';
import { createPacketBus } from '$lib/services/packet-bus';
import { PackType } from '$lib/packet-decoder.js';
import { createMalformedPacket, createSynthesizePacket } from '../../mocks/packet-data.js';

function createFakeSerial() {
  const handlersByType = new Map();

  return {
    registerPacketHandler(packetType, handler) {
      const handlers = handlersByType.get(packetType) ?? [];
      handlers.push(handler);
      handlersByType.set(packetType, handlers);

      return () => {
        const list = handlersByType.get(packetType);
        if (!list) return;
        const index = list.indexOf(handler);
        if (index >= 0) list.splice(index, 1);
        if (list.length === 0) handlersByType.delete(packetType);
      };
    },
    emit(packetType, packet) {
      const handlers = handlersByType.get(packetType) ?? [];
      handlers.forEach((handler) => handler(packet));
    },
    getRegisteredTypes() {
      return Array.from(handlersByType.keys());
    }
  };
}

describe('createPacketBus', () => {
  it('registers handlers and emits decoded events while started', () => {
    const serial = createFakeSerial();
    const bus = createPacketBus(serial);

    const onRawPacket = vi.fn();
    const onDecodedPacket = vi.fn();
    const onSynthesize = vi.fn();

    bus.onRawPacket.subscribe(onRawPacket);
    bus.onDecodedPacket.subscribe(onDecodedPacket);
    bus.onSynthesize.subscribe(onSynthesize);

    bus.start();
    bus.start(); // idempotent

    expect(serial.getRegisteredTypes()).toEqual(
      expect.arrayContaining([
        PackType.SYNTHESIZE,
        PackType.WAVE,
        PackType.ADDR,
        PackType.UPDAT_CH,
        PackType.MACHINE,
        PackType.ERR_240,
      ])
    );

    const synthesizePacket = Array.from(
      createSynthesizePacket([{ online: 1, type: 1, voltage: 5000, current: 1000 }])
    );
    serial.emit(PackType.SYNTHESIZE, synthesizePacket);

    expect(onRawPacket).toHaveBeenCalledTimes(1);
    expect(onDecodedPacket).toHaveBeenCalledTimes(1);
    expect(onSynthesize).toHaveBeenCalledTimes(1);
  });

  it('does not emit events after stop', () => {
    const serial = createFakeSerial();
    const bus = createPacketBus(serial);

    const onRawPacket = vi.fn();
    bus.onRawPacket.subscribe(onRawPacket);

    bus.start();
    serial.emit(PackType.SYNTHESIZE, Array.from(createSynthesizePacket()));
    expect(onRawPacket).toHaveBeenCalledTimes(1);

    bus.stop();
    serial.emit(PackType.SYNTHESIZE, Array.from(createSynthesizePacket()));
    expect(onRawPacket).toHaveBeenCalledTimes(1);
  });

  it('emits raw packets even when decode fails', () => {
    const serial = createFakeSerial();
    const bus = createPacketBus(serial);

    const onRawPacket = vi.fn();
    const onDecodedPacket = vi.fn();

    bus.onRawPacket.subscribe(onRawPacket);
    bus.onDecodedPacket.subscribe(onDecodedPacket);

    bus.start();
    serial.emit(PackType.SYNTHESIZE, Array.from(createMalformedPacket('short')));

    expect(onRawPacket).toHaveBeenCalledTimes(1);
    expect(onDecodedPacket).not.toHaveBeenCalled();
  });
});

