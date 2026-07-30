export type RecordClockSync = {
  schema: 1;
  transition_id: string;
  trace_timestamp_ns: number;
  host_realtime_ns: string;
  bracket_uncertainty_ns: number;
  host_realtime_resolution_ns: number;
  clock_relationship: 'trace-relative-monotonic-to-host-realtime';
};

const TRANSITION_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

export function parseRecordCorrelation(
  transitionId: string | undefined,
  syncJsonPath: string | undefined,
  replayPerfettoPath: string | undefined
): { transitionId: string | null; syncJsonPath: string | null } {
  if (transitionId === undefined && syncJsonPath === undefined) {
    return { transitionId: null, syncJsonPath: null };
  }
  if (replayPerfettoPath) {
    throw new Error('transition correlation is unavailable during Perfetto replay');
  }
  if (!transitionId || !TRANSITION_ID.test(transitionId)) {
    throw new Error(
      'Transition ID must be 1-64 characters using letters, digits, dot, underscore, or dash'
    );
  }
  if (!syncJsonPath) {
    throw new Error('--transition-id requires --clock-sync-json');
  }
  return { transitionId, syncJsonPath };
}

export function buildRecordClockSync(
  transitionId: string,
  traceBeforeNs: number,
  traceAfterNs: number,
  hostRealtimeNs: string | number | bigint
): RecordClockSync {
  if (traceAfterNs < traceBeforeNs) {
    throw new Error('Trace clock bracket moved backwards');
  }
  if (
    typeof hostRealtimeNs === 'number' &&
    (!Number.isSafeInteger(hostRealtimeNs) || hostRealtimeNs < 0)
  ) {
    throw new Error('Host realtime must be a non-negative safe integer');
  }
  const hostRealtime = hostRealtimeNs.toString();
  if (!/^[0-9]+$/.test(hostRealtime)) {
    throw new Error('Host realtime must be an integer nanosecond value');
  }
  return {
    schema: 1,
    transition_id: transitionId,
    trace_timestamp_ns: Math.round((traceBeforeNs + traceAfterNs) / 2),
    host_realtime_ns: hostRealtime,
    bracket_uncertainty_ns:
      Math.ceil((traceAfterNs - traceBeforeNs) / 2) + 500_000,
    host_realtime_resolution_ns: 1_000_000,
    clock_relationship: 'trace-relative-monotonic-to-host-realtime'
  };
}
