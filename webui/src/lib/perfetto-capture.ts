export type PerfettoAlertType =
  | 'voltage_oos'
  | 'current_oos'
  | 'power_oos'
  | 'delta_t_oos'
  | 'checksum_failed';

type TraceMessage = {
  packet: TracePacket[];
};

type TracePacket = {
  timestamp?: number;
  trackEvent?: TrackEvent;
  trackDescriptor?: TrackDescriptor;
  trustedPacketSequenceId?: number;
};

type TrackEvent = {
  type?: number;
  trackUuid?: number;
  name?: string;
  categories?: string[];
  debugAnnotations?: DebugAnnotation[];
};

type TrackDescriptor = {
  uuid?: number;
  parentUuid?: number;
  name?: string;
  process?: ProcessDescriptor;
  thread?: ThreadDescriptor;
};

type ProcessDescriptor = {
  pid?: number;
  processName?: string;
  startTimestampNs?: number;
};

type ThreadDescriptor = {
  pid?: number;
  tid?: number;
  threadName?: string;
};

type DebugAnnotation = {
  name?: string;
  boolValue?: boolean;
  uintValue?: number;
  intValue?: number;
  doubleValue?: number;
  stringValue?: string;
};

type PerfettoNamespace = {
  protos: {
    Trace: {
      encode: (message: TraceMessage) => { finish: () => Uint8Array };
    };
    TracePacket: {
      encodeDelimited: (message: TracePacket) => { finish: () => Uint8Array };
    };
  };
};

export type PerfettoCaptureOptions = {
  processName: string;
  nowNs: () => number;
  startNs?: number;
  pid?: number;
  rawThreadName?: string;
  alertThreadName?: string;
  rawTid?: number;
  alertTid?: number;
  maxRawBytes?: number;
  format?: 'trace' | 'stream';
};

export type PerfettoAlert = {
  type: PerfettoAlertType;
  channel?: number;
  value?: number;
  limit?: number;
  unit?: string;
  deltaNs?: number;
  timestampNs?: number;
  packetType?: number;
  packetSize?: number;
  checksum?: number;
  expectedChecksum?: number;
  note?: string;
};

export type PerfettoCapture = {
  recordRawChunk: (chunk: Uint8Array) => void;
  recordAlert: (alert: PerfettoAlert) => void;
  serialize: () => Uint8Array;
};

const TRACK_EVENT_TYPE_INSTANT = 3;

function toHexString(data: Uint8Array): string {
  return Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function buildAnnotation(name: string, value: string | number | boolean): DebugAnnotation {
  if (typeof value === 'boolean') {
    return { name, boolValue: value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      if (value >= 0) {
        return { name, uintValue: value };
      }
      return { name, intValue: value };
    }
    return { name, doubleValue: value };
  }
  return { name, stringValue: value };
}

export function createPerfettoCapture(
  proto: PerfettoNamespace,
  options: PerfettoCaptureOptions
): PerfettoCapture {
  const packets: TracePacket[] = [];
  const startNs = options.startNs ?? options.nowNs();
  const processUuid = 1;
  const rawThreadUuid = 2;
  const alertThreadUuid = 3;
  const pid = options.pid ?? 1;
  const rawThreadName = options.rawThreadName ?? 'UART_RX';
  const alertThreadName = options.alertThreadName ?? 'Alerts';
  const rawTid = options.rawTid ?? 1;
  const alertTid = options.alertTid ?? 2;
  const maxRawBytes = options.maxRawBytes ?? 0;
  const format = options.format ?? 'stream';
  const trustedPacketSequenceId = 0x123;

  packets.push({
    trackDescriptor: {
      uuid: processUuid,
      name: options.processName,
      process: {
        pid,
        processName: options.processName,
        startTimestampNs: 0
      }
    }
  });

  packets.push({
    trackDescriptor: {
      uuid: rawThreadUuid,
      parentUuid: processUuid,
      name: rawThreadName,
      thread: {
        pid,
        tid: rawTid,
        threadName: rawThreadName
      }
    }
  });

  packets.push({
    trackDescriptor: {
      uuid: alertThreadUuid,
      parentUuid: processUuid,
      name: alertThreadName,
      thread: {
        pid,
        tid: alertTid,
        threadName: alertThreadName
      }
    }
  });

  const addInstantEvent = (
    trackUuid: number,
    name: string,
    annotations: DebugAnnotation[],
    timestampNs: number
  ): void => {
    packets.push({
      timestamp: Math.max(0, Math.round(timestampNs)),
      trackEvent: {
        type: TRACK_EVENT_TYPE_INSTANT,
        trackUuid,
        name,
        categories: ['mdp'],
        debugAnnotations: annotations
      },
      trustedPacketSequenceId
    });
  };

  addInstantEvent(
    alertThreadUuid,
    'alerts_ready',
    [buildAnnotation('status', 'ready')],
    0
  );

  const recordRawChunk = (chunk: Uint8Array): void => {
    const timestampNs = options.nowNs() - startNs;
    const slice = maxRawBytes > 0 ? chunk.slice(0, maxRawBytes) : chunk;
    const annotations: DebugAnnotation[] = [
      buildAnnotation('size', chunk.length),
      buildAnnotation('hex', toHexString(slice))
    ];

    if (maxRawBytes > 0 && chunk.length > maxRawBytes) {
      annotations.push(buildAnnotation('truncated', true));
      annotations.push(buildAnnotation('raw_length', chunk.length));
    }

    addInstantEvent(rawThreadUuid, 'rx_chunk', annotations, timestampNs);
  };

  const recordAlert = (alert: PerfettoAlert): void => {
    const timestampNs = (alert.timestampNs ?? options.nowNs()) - startNs;
    const annotations: DebugAnnotation[] = [buildAnnotation('type', alert.type)];

    if (typeof alert.channel === 'number') {
      annotations.push(buildAnnotation('channel', alert.channel));
    }
    if (typeof alert.value === 'number') {
      annotations.push(buildAnnotation('value', alert.value));
    }
    if (typeof alert.limit === 'number') {
      annotations.push(buildAnnotation('limit', alert.limit));
    }
    if (typeof alert.deltaNs === 'number') {
      annotations.push(buildAnnotation('delta_ns', alert.deltaNs));
    }
    if (typeof alert.packetType === 'number') {
      annotations.push(buildAnnotation('packet_type', alert.packetType));
    }
    if (typeof alert.packetSize === 'number') {
      annotations.push(buildAnnotation('packet_size', alert.packetSize));
    }
    if (typeof alert.checksum === 'number') {
      annotations.push(buildAnnotation('checksum', alert.checksum));
    }
    if (typeof alert.expectedChecksum === 'number') {
      annotations.push(buildAnnotation('expected_checksum', alert.expectedChecksum));
    }
    if (alert.unit) {
      annotations.push(buildAnnotation('unit', alert.unit));
    }
    if (alert.note) {
      annotations.push(buildAnnotation('note', alert.note));
    }

    addInstantEvent(alertThreadUuid, `alert:${alert.type}`, annotations, timestampNs);
  };

  const serialize = (): Uint8Array => {
    if (format === 'trace') {
      const trace: TraceMessage = { packet: packets };
      return proto.protos.Trace.encode(trace).finish();
    }
    const chunks = packets.map((packet) => proto.protos.TracePacket.encodeDelimited(packet).finish());
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  };

  return {
    recordRawChunk,
    recordAlert,
    serialize
  };
}
