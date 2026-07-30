import { describe, expect, it } from 'vitest';
import {
  buildRecordClockSync,
  parseRecordCorrelation
} from '../src/record-correlation';


describe('record transition correlation', () => {
  it('keeps ordinary recording unchanged', () => {
    expect(parseRecordCorrelation(undefined, undefined, undefined)).toEqual({
      transitionId: null,
      syncJsonPath: null
    });
  });

  it('accepts a bounded transition ID and sidecar path', () => {
    expect(
      parseRecordCorrelation('rtc-deep.r01', '/tmp/sync.json', undefined)
    ).toEqual({
      transitionId: 'rtc-deep.r01',
      syncJsonPath: '/tmp/sync.json'
    });
  });

  it('rejects ambiguous or replay-only combinations', () => {
    expect(() =>
      parseRecordCorrelation('bad id', '/tmp/sync.json', undefined)
    ).toThrow('Transition ID');
    expect(() =>
      parseRecordCorrelation('valid', undefined, undefined)
    ).toThrow('requires --clock-sync-json');
    expect(() =>
      parseRecordCorrelation('valid', '/tmp/sync.json', 'trace.pb')
    ).toThrow('unavailable during Perfetto replay');
  });

  it('summarizes the trace/realtime sampling bracket', () => {
    expect(buildRecordClockSync('transition-1', 100, 120, 5000)).toEqual({
      schema: 1,
      transition_id: 'transition-1',
      trace_timestamp_ns: 110,
      host_realtime_ns: '5000',
      bracket_uncertainty_ns: 500010,
      host_realtime_resolution_ns: 1_000_000,
      clock_relationship: 'trace-relative-monotonic-to-host-realtime'
    });
  });

  it('preserves contemporary epoch nanoseconds without Number truncation', () => {
    const epoch = 1_785_365_000_123_000_000n;
    expect(buildRecordClockSync('transition-1', 100, 100, epoch))
      .toMatchObject({
        host_realtime_ns: epoch.toString(),
        host_realtime_resolution_ns: 1_000_000
      });
    expect(() =>
      buildRecordClockSync('transition-1', 100, 100, Number(epoch))
    ).toThrow('safe integer');
  });
});
