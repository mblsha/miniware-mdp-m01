import { SerialConnection } from '../serial';
import { createPacketBus } from '../services/packet-bus';
import type { PacketBus } from '../services/packet-bus';
import { createChannelStore } from '../stores/channels';
import type { ChannelStore } from '../stores/channels';
import { createSparklineStore } from '../stores/sparkline';
import type { SparklineStore } from '../stores/sparkline';
import { createTimeseriesStore } from '../stores/timeseries';
import type { TimeseriesStore } from '../stores/timeseries';
import { createTimeseriesIntegration } from '../stores/timeseries-integration';
import type { TimeseriesIntegration } from '../stores/timeseries-integration';

export type AppRuntime = {
  serial: SerialConnection;
  packets: PacketBus;
  channels: ChannelStore;
  sparklines: SparklineStore;
  timeseries: TimeseriesStore;
  timeseriesIntegration: TimeseriesIntegration;
  destroy: () => void;
};

export function createRuntime(options?: { serial?: SerialConnection }): AppRuntime {
  const serial = options?.serial ?? new SerialConnection();
  const packets = createPacketBus(serial);

  packets.start();

  const channels = createChannelStore({ serial, packets });
  const timeseries = createTimeseriesStore();
  const sparklines = createSparklineStore({ channels: channels.channels });
  const timeseriesIntegration = createTimeseriesIntegration({ packets, timeseries, channels });

  const destroy = (): void => {
    sparklines.destroy();
    timeseriesIntegration.destroy();
    channels.destroy();
    packets.stop();
  };

  return {
    serial,
    packets,
    channels,
    sparklines,
    timeseries,
    timeseriesIntegration,
    destroy,
  };
}
