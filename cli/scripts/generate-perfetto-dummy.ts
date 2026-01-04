import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { perfetto } from '../../third_party/retrobus-perfetto/ts/src/proto/perfetto_pb.js';

const outputPath = resolve(
  process.argv[2] ?? '../recordings/perfetto_dummy.perfetto-trace'
);

const trace = perfetto.protos.Trace.create({
  packet: [
    {
      trackDescriptor: {
        uuid: 1,
        process: {
          pid: 1234,
          processName: 'TestProcess'
        }
      }
    },
    {
      trackDescriptor: {
        uuid: 2,
        parentUuid: 1,
        thread: {
          pid: 1234,
          tid: 1,
          threadName: 'TestThread'
        }
      }
    },
    {
      timestamp: 1500,
      trustedPacketSequenceId: 0x123,
      trackEvent: {
        type: 3,
        trackUuid: 2,
        name: 'checkpoint'
      }
    }
  ]
});

const data = perfetto.protos.Trace.encode(trace).finish();

await new Promise<void>((resolvePromise, reject) => {
  const stream = createWriteStream(outputPath);
  stream.once('error', reject);
  stream.end(data, () => resolvePromise());
});

console.log(`Wrote dummy trace to ${outputPath}`);
