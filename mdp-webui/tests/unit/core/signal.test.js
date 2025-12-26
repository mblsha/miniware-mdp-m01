import { describe, expect, it, vi } from 'vitest';
import { createSignal } from '$lib/core/signal';

describe('createSignal', () => {
  it('notifies subscribers on emit', () => {
    const signal = createSignal();
    const handler = vi.fn();

    signal.subscribe(handler);
    signal.emit('hello');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('hello');
  });

  it('stops notifying after unsubscribe', () => {
    const signal = createSignal();
    const handler = vi.fn();

    const unsubscribe = signal.subscribe(handler);
    unsubscribe();

    signal.emit('ignored');
    expect(handler).not.toHaveBeenCalled();
  });
});

