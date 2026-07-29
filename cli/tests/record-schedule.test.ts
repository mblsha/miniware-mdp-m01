import { describe, expect, it } from 'vitest';
import { parseOutputOnAfterSeconds } from '../src/record-schedule';


describe('record output schedule', () => {
  it('accepts a bounded live output-on transition', () => {
    expect(parseOutputOnAfterSeconds('2.5', 10, undefined)).toBe(2.5);
  });

  it('leaves ordinary recording unchanged', () => {
    expect(parseOutputOnAfterSeconds(undefined, 10, undefined)).toBeNull();
  });

  it('requires a finite recording duration', () => {
    expect(() => parseOutputOnAfterSeconds('2', null, undefined)).toThrow(
      'requires a finite --duration'
    );
  });

  it('rejects a transition at or after the recording end', () => {
    expect(() => parseOutputOnAfterSeconds('10', 10, undefined)).toThrow(
      'before the recording duration ends'
    );
  });

  it('rejects replay and invalid delays', () => {
    expect(() => parseOutputOnAfterSeconds('2', 10, 'trace.pb')).toThrow(
      'unavailable during Perfetto replay'
    );
    expect(() => parseOutputOnAfterSeconds('0', 10, undefined)).toThrow(
      'positive number'
    );
  });
});
