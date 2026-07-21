import { createWriteStream } from 'node:fs';
import { format } from 'node:util';
import { Command } from 'commander';
import { SerialPort } from 'serialport';
import { get } from 'svelte/store';
import { NodeSerialConnection } from './node-serial';
import { ReplaySerialConnection } from './replay-serial';
import { WaveTimestampReconciler, type WaveSample } from '../../webui/src/lib/wave-reconciler';
import {
  ContextRegistry,
  categorizeDevice,
  type DeviceCategory,
  type DeviceContext,
  type DeviceContextParams
} from './context-registry';
import {
  buildContextsFromChannels,
  selectChannelFromChannels,
  selectMachineTypeFromChannels
} from './context-detection';
import { createPerfettoCapture, type PerfettoCapture } from '../../webui/src/lib/perfetto-capture';
import {
  createGetMachinePacket,
  createHeartbeatPacket,
  createSetChannelPacket,
  createSetCurrentPacket,
  createSetOutputPacket,
  createSetVoltagePacket
} from '../../webui/src/lib/packet-encoder';
import {
  decodePacket,
  processMachinePacket,
  processSynthesizePacket,
  processWavePacket,
  validatePacketChecksum,
  type ChannelUpdate,
  isMachinePacket,
  isWavePacket
} from '../../webui/src/lib/packet-decoder';
import { getDeviceLimits, validateDeviceTargets } from '../../webui/src/lib/device-limits';
import { PackType } from './packet-types';
import { debugEnabled } from '../../webui/src/lib/debug-logger';
import { getMachineTypeString } from '../../webui/src/lib/machine-utils';
import { perfetto } from '../../third_party/retrobus-perfetto/ts/src/proto/perfetto_pb.js';
import { loadReplayChunks } from './perfetto-replay';
import { requestChannelStatus, requestPacket, requestSynthesizeChannels } from './device-requests';

const TARGET_VENDOR_ID = 0x0416;
const TARGET_PRODUCT_ID = 0xdc01;

type PortInfo = Awaited<ReturnType<typeof SerialPort.list>>[number];

const program = new Command();

debugEnabled.set(false);

const DEFAULT_WAVE_GAP_NS = 1_000_000_000;
const DEFAULT_RECONCILE_DELAY_NS = 2_000_000_000;
const DEFAULT_RECONCILE_TAIL_NS = 500_000_000;

program.option('--debug', 'Enable Kaitai/debug logging');

program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  debugEnabled.set(Boolean(opts.debug));
});

function createMonotonicNowNs(): () => number {
  const start = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - start);
}

function createReplayNowNs(): { nowNs: () => number; setNowNs: (value: number) => void } {
  let current = 0;
  return {
    nowNs: () => current,
    setNowNs: (value: number) => {
      current = value;
    }
  };
}

function normalizeId(value?: string | number): number[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (typeof value === 'number') {
    return [value];
  }

  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return [];
  }

  const candidates: number[] = [];
  if (trimmed.startsWith('0x')) {
    candidates.push(Number.parseInt(trimmed.slice(2), 16));
  } else {
    candidates.push(Number.parseInt(trimmed, 10));
    candidates.push(Number.parseInt(trimmed, 16));
  }

  return candidates.filter(Number.isFinite);
}

function matchesMiniwarePort(port: PortInfo): boolean {
  const vendorIds = normalizeId(port.vendorId);
  const productIds = normalizeId(port.productId);

  return vendorIds.includes(TARGET_VENDOR_ID) && productIds.includes(TARGET_PRODUCT_ID);
}
async function getAutoPort(): Promise<string> {
  const ports = await SerialPort.list();
  const matchingPorts = ports.filter(matchesMiniwarePort);
  if (matchingPorts.length === 0) {
    throw new Error('No Miniware serial ports detected');
  }

  const portInfo = matchingPorts[0];
  console.log(
    `Auto-selected serial port ${portInfo.path}${portInfo.manufacturer ? ` (${portInfo.manufacturer})` : ''}`
  );
  return portInfo.path;
}

async function resolvePort(provided?: string): Promise<string> {
  if (provided) {
    return provided;
  }

  return await getAutoPort();
}

function formatChannelLine(update: ChannelUpdate): string {
  const online = update.online ? 'ONLINE' : 'OFFLINE';
  const voltage = (update.voltage ?? 0).toFixed(3);
  const current = (update.current ?? 0).toFixed(3);
  const output = update.isOutput ? 'OUTPUT ON' : 'OUTPUT OFF';
  return `Ch${update.channel}: ${online} | ${voltage}V ${current}A | ${output}`;
}

function parseChannelArg(value: string): number {
  const channel = Number(value);
  if (!Number.isInteger(channel) || channel < 0 || channel > 5) {
    throw new Error('Channel must be an integer between 0 and 5');
  }
  return channel;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertAppliedTarget(name: string, actual: number | undefined, expected: number): void {
  if (actual === undefined || Math.abs(actual - expected) > 0.001) {
    throw new Error(`${name} was not acknowledged by the device (expected ${expected}, received ${actual ?? 'unknown'})`);
  }
}

type CsvWriter = {
  writeLine: (line: string) => void;
  close: () => Promise<void>;
};

function createCsvWriter(outputPath?: string): CsvWriter {
  if (outputPath) {
    const stream = createWriteStream(outputPath, { encoding: 'utf8' });
    let streamError: Error | null = null;
    stream.on('error', (error) => {
      streamError = error;
    });
    return {
      writeLine: (line) => {
        if (streamError) throw streamError;
        stream.write(`${line}\n`);
      },
      close: () =>
        new Promise((resolve, reject) => {
          if (streamError) {
            reject(streamError);
            return;
          }
          const cleanup = () => {
            stream.removeListener('error', onError);
            stream.removeListener('finish', onFinish);
          };
          const onError = (error: Error) => {
            cleanup();
            reject(error);
          };
          const onFinish = () => {
            cleanup();
            resolve();
          };
          stream.once('error', onError);
          stream.once('finish', onFinish);
          stream.end();
        })
    };
  }

  return {
    writeLine: (line) => {
      process.stdout.write(`${line}\n`);
    },
    close: async () => {}
  };
}

function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(path);
    stream.once('error', reject);
    stream.end(data, () => resolve());
  });
}

function parseDurationSeconds(value?: string): number | null {
  if (value === undefined) {
    return null;
  }
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Duration must be a positive number of seconds');
  }
  return duration;
}
const STATUS_TIMEOUT_MS = 5000;


async function fetchSynthesizeChannels(
  connection: NodeSerialConnection,
  timeoutMs = 2500
): Promise<ChannelUpdate[] | null> {
  return requestSynthesizeChannels(connection, timeoutMs);
}

async function detectChannelFromSynthesize(
  connection: NodeSerialConnection,
  category: DeviceCategory,
  timeoutMs = 2500
): Promise<{ channel: number; update: ChannelUpdate } | null> {
  const processed = await fetchSynthesizeChannels(connection, timeoutMs);
  if (!processed || processed.length === 0) {
    return null;
  }

  const selected = selectChannelFromChannels(processed, category);
  if (!selected) {
    return null;
  }

  return { channel: selected.channel, update: selected };
}

async function discoverDeviceContexts(): Promise<DeviceContextParams[]> {
  const ports = (await SerialPort.list()).filter(matchesMiniwarePort);
  const contexts: DeviceContextParams[] = [];

  for (const port of ports) {
    const connection = new NodeSerialConnection({ portPath: port.path });
    try {
      await connection.connect();
      const response = await requestPacket(
        connection,
        PackType.MACHINE,
        createGetMachinePacket(),
        5000
      );
      const decoded = response ? decodePacket(response) : null;
      const info = decoded ? processMachinePacket(decoded) : null;

      if (!response) {
        console.warn(`No machine response from ${port.path}; probing synthesize data instead.`);
      } else if (!info) {
        console.warn(`Unable to decode machine packet from ${port.path}; probing synthesize data instead.`);
      }

      const synthesizeChannels = await fetchSynthesizeChannels(connection);
      const channelContexts = synthesizeChannels
        ? buildContextsFromChannels(port.path, synthesizeChannels)
        : [];

      if (channelContexts.length > 0) {
        contexts.push(...channelContexts);
        continue;
      }

      if (!info) {
        contexts.push({
          portPath: port.path,
          category: 'psu',
          machineType: 'Unknown'
        });
        continue;
      }

      const machineData = decoded && isMachinePacket(decoded) ? decoded.data : null;
      const fallbackLabel =
        machineData?.machineName ?? (machineData ? getMachineTypeString(machineData.machineTypeRaw) : undefined);
      const channelMachineTypes = synthesizeChannels
        ? selectMachineTypeFromChannels(synthesizeChannels)
        : null;
      const machineType = channelMachineTypes ?? fallbackLabel ?? info.type;
      const category = categorizeDevice(machineType);
      const channelHint = synthesizeChannels
        ? selectChannelFromChannels(synthesizeChannels, category)
        : null;
      contexts.push({
        portPath: port.path,
        category,
        machineType,
        channel: channelHint?.channel
      });
    } catch (error) {
      console.warn(`Failed to probe ${port.path}:`, error instanceof Error ? error.message : error);
    } finally {
      await connection.disconnect();
    }
  }

  return contexts;
}

async function waitForChannelStatus(
  connection: NodeSerialConnection,
  channel: number,
  timeoutMs = STATUS_TIMEOUT_MS
): Promise<ChannelUpdate | null> {
  return requestChannelStatus(connection, channel, timeoutMs);
}


interface ContextCommandOptions {
  channel?: string;
  status?: boolean;
  statusJson?: boolean;
  setVoltage?: string;
  setCurrent?: string;
}

interface RecordCommandOptions {
  duration?: string;
  outputCsv?: string;
  outputPerfetto?: string;
  replayPerfetto?: string;
}

async function handleContextCommand(
  alias: string,
  context: DeviceContext,
  options: ContextCommandOptions,
  outputState?: string
): Promise<void> {
  const wantsStatus = Boolean(options.status || options.statusJson);
  const wantsSets = options.setVoltage !== undefined || options.setCurrent !== undefined;
  const wantsOutput = typeof outputState === 'string';
  const normalizedOutputState = wantsOutput ? (outputState ?? '').toLowerCase() : undefined;

  if (!wantsStatus && !wantsSets && !wantsOutput) {
    throw new Error(
      'Provide at least one action: --status, --status-json, --set-voltage, --set-current, or output state (on/off)'
    );
  }

  const connection = new NodeSerialConnection({ portPath: context.portPath });
  await connection.connect();
  try {
    let channel: number;
    let baseline: ChannelUpdate | null = null;

    if (options.channel !== undefined) {
      channel = parseChannelArg(options.channel);
    } else if (typeof context.channel === 'number') {
      channel = context.channel;
    } else {
      const detected = await detectChannelFromSynthesize(connection, context.category);
      if (detected) {
        channel = detected.channel;
        baseline = detected.update;
      } else if (context.category === 'load') {
        throw new Error('Unable to auto-detect device channel; pass --channel explicitly.');
      } else {
        channel = 0;
      }
    }

    if (wantsStatus || wantsSets) {
      if (!baseline) {
        baseline = await waitForChannelStatus(connection, channel);
      }
      if (!baseline) {
        throw new Error('No synthesize data received yet for the requested channel');
      }
    }

    const parsedVoltage = options.setVoltage !== undefined ? Number(options.setVoltage) : undefined;
    const parsedCurrent = options.setCurrent !== undefined ? Number(options.setCurrent) : undefined;

    if (parsedVoltage !== undefined && !Number.isFinite(parsedVoltage)) {
      throw new Error('Target voltage must be a valid number');
    }

    if (parsedCurrent !== undefined && !Number.isFinite(parsedCurrent)) {
      throw new Error('Target current must be a valid number');
    }

    const voltageTarget = parsedVoltage ?? baseline?.targetVoltage ?? baseline?.voltage;
    const currentTarget = parsedCurrent ?? baseline?.targetCurrent ?? baseline?.current;

    if (wantsSets) {
      if (voltageTarget === undefined || currentTarget === undefined) {
        throw new Error('Unable to preserve the companion setpoint without current device status');
      }
      validateDeviceTargets(
        baseline?.machineType ?? context.machineType,
        voltageTarget,
        currentTarget
      );
    }

    if (parsedVoltage !== undefined && voltageTarget !== undefined && currentTarget !== undefined) {
      await connection.sendPacket(createSetChannelPacket(channel));
      await delay(50);
      await connection.sendPacket(createSetVoltagePacket(channel, voltageTarget, currentTarget));
      await delay(50);
    }

    if (parsedCurrent !== undefined && voltageTarget !== undefined && currentTarget !== undefined) {
      await connection.sendPacket(createSetChannelPacket(channel));
      await delay(50);
      await connection.sendPacket(createSetCurrentPacket(channel, voltageTarget, currentTarget));
      await delay(50);
    }

    if (wantsOutput) {
      if (!['on', 'off'].includes(normalizedOutputState!)) {
        throw new Error('Output state must be "on" or "off"');
      }
      await connection.sendPacket(createSetChannelPacket(channel));
      await delay(50);
      await connection.sendPacket(createSetOutputPacket(channel, normalizedOutputState === 'on'));
      await delay(50);
    }

    const finalStatus = wantsSets || wantsOutput
      ? await waitForChannelStatus(connection, channel)
      : baseline;
    if ((wantsStatus || wantsSets || wantsOutput) && !finalStatus) {
      throw new Error('Device did not acknowledge the command with synthesize status');
    }
    if (finalStatus && wantsSets) {
      if (parsedVoltage !== undefined) {
        assertAppliedTarget('Voltage target', finalStatus.targetVoltage, voltageTarget!);
      }
      if (parsedCurrent !== undefined) {
        assertAppliedTarget('Current target', finalStatus.targetCurrent, currentTarget!);
      }
    }
    if (finalStatus && wantsOutput && finalStatus.isOutput !== (normalizedOutputState === 'on')) {
      throw new Error(`Output ${normalizedOutputState?.toUpperCase()} was not acknowledged by the device`);
    }

    if (options.statusJson && finalStatus) {
      const payload = {
        alias,
        category: context.category,
        machineType: context.machineType,
        channel,
        status: finalStatus
      };
      console.log(JSON.stringify(payload, null, 2));
    }

    if (options.status && finalStatus) {
      const voltage = finalStatus.voltage ?? 0;
      const targetVoltage = finalStatus.targetVoltage ?? 0;
      const current = finalStatus.current ?? 0;
      const targetCurrent = finalStatus.targetCurrent ?? 0;
      const temperature = finalStatus.temperature ?? 0;
      const lines = [
        `${alias} (${context.machineType}) channel ${channel}:`,
        `  Online: ${finalStatus.online ? 'YES' : 'NO'}`,
        `  Voltage: ${voltage.toFixed(3)} V (target ${targetVoltage.toFixed(3)} V)`,
        `  Current: ${current.toFixed(3)} A (target ${targetCurrent.toFixed(3)} A)`,
        `  Temperature: ${temperature.toFixed(1)} °C`,
        `  Output: ${finalStatus.isOutput ? 'ON' : 'OFF'}`,
        `  Mode: ${finalStatus.mode}`
      ];
      lines.forEach((line) => console.log(line));
    } else if (wantsSets && finalStatus && !options.status && !options.statusJson) {
      const voltage = finalStatus.voltage ?? 0;
      const current = finalStatus.current ?? 0;
      console.log(
        `${alias} channel ${channel} updated: ${voltage.toFixed(3)} V / ${current.toFixed(3)} A`
      );
    } else if (wantsOutput && !wantsStatus && !options.statusJson && !wantsSets) {
      console.log(`${alias} channel ${channel} output ${finalStatus?.isOutput ? 'ON' : 'OFF'}`);
    }
  } finally {
    await connection.disconnect();
  }
}

async function handleRecordCommand(
  alias: string,
  context: DeviceContext,
  options: RecordCommandOptions
): Promise<void> {
  let channel = typeof context.channel === 'number' ? context.channel : 0;
  const durationSeconds = parseDurationSeconds(options.duration);
  const outputPath = options.outputCsv;
  const perfettoPath = options.outputPerfetto;
  const replayPerfettoPath = options.replayPerfetto;
  const deviceLimits = getDeviceLimits(context.machineType);
  if (!deviceLimits) {
    throw new Error(`Unknown device type "${context.machineType}". Cannot determine max specs.`);
  }
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const restoreConsole = () => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
  };
  const log = (message: string) => {
    process.stderr.write(`${message}\n`);
  };

  if (get(debugEnabled)) {
    debugEnabled.set(false);
    log('Debug logging disabled during recording to keep CSV output clean.');
  }

  const connection = replayPerfettoPath
    ? new ReplaySerialConnection()
    : new NodeSerialConnection({ portPath: context.portPath });
  const replayClock = replayPerfettoPath ? createReplayNowNs() : null;
  const recordNowNs = replayClock ? replayClock.nowNs : createMonotonicNowNs();
  const perfettoNowNs = perfettoPath ? recordNowNs : null;
  const perfettoCapture: PerfettoCapture | null = perfettoPath && perfettoNowNs
    ? createPerfettoCapture(perfetto, {
        processName: `mdp-cli ${alias}`,
        nowNs: perfettoNowNs,
        startNs: 0,
        pid: process.pid,
        rawThreadName: 'UART_RX',
        alertThreadName: 'Alerts',
        format: 'trace'
      })
    : null;
  const unsubscribePacketObserver = perfettoCapture
    ? connection.registerPacketObserver((packet) => {
        const validation = validatePacketChecksum(packet);
        if (!validation || validation.ok) return;
        perfettoCapture.recordAlert({
          type: 'checksum_failed',
          channel: validation.channel,
          packetType: validation.packetType,
          packetSize: validation.size,
          checksum: validation.actual,
          expectedChecksum: validation.expected,
          note: 'XOR checksum mismatch'
        });
      })
    : null;
  const unsubscribeRaw = perfettoCapture
    ? connection.registerRawDataHandler((chunk) => perfettoCapture.recordRawChunk(chunk))
    : null;
  const writer = createCsvWriter(outputPath);
  console.log = (...args: unknown[]) => {
    process.stderr.write(`${format(...args)}\n`);
  };
  console.warn = (...args: unknown[]) => {
    process.stderr.write(`${format(...args)}\n`);
  };
  let unsubscribeWave: (() => void) | null = null;
  let durationTimer: ReturnType<typeof setTimeout> | null = null;
  let onSigint: (() => void) | null = null;
  let connectionClosed = false;
  let writerClosed = false;
  try {
    await connection.connect();
    if (!replayPerfettoPath) {
      if (typeof context.channel !== 'number') {
        const detected = connection instanceof NodeSerialConnection
          ? await detectChannelFromSynthesize(connection, context.category)
          : null;
        if (detected) {
          channel = detected.channel;
        } else if (context.category === 'load') {
          throw new Error('Unable to auto-detect device channel; run `devices` and choose the correct device alias.');
        }
      }
      await connection.sendPacket(createSetChannelPacket(channel));
      await delay(50);
      connection.startHeartbeat(() => createHeartbeatPacket(), 1000);
    }

    let pointCount = 0;
    let hasWaveData = false;
    let lastWavePacketNs: number | null = null;
    const ignoredChannels = new Set<number>();
    const reconciler = new WaveTimestampReconciler(
      DEFAULT_RECONCILE_DELAY_NS,
      DEFAULT_RECONCILE_TAIL_NS
    );

    const emitSamples = (samples: WaveSample[]) => {
      samples.forEach((sample) => {
        writer.writeLine(
          `${sample.timeSeconds.toFixed(6)},${sample.voltage.toFixed(6)},${sample.current.toFixed(6)}`
        );
        pointCount += 1;
        if (perfettoCapture) {
          if (deviceLimits && sample.voltage > deviceLimits.maxVoltage) {
            perfettoCapture.recordAlert({
              type: 'voltage_oos',
              channel,
              value: sample.voltage,
              limit: deviceLimits.maxVoltage,
              unit: 'V'
            });
          }
          if (deviceLimits && sample.current > deviceLimits.maxCurrent) {
            perfettoCapture.recordAlert({
              type: 'current_oos',
              channel,
              value: sample.current,
              limit: deviceLimits.maxCurrent,
              unit: 'A'
            });
          }
          const power = sample.voltage * sample.current;
          if (deviceLimits && power > deviceLimits.maxPower) {
            perfettoCapture.recordAlert({
              type: 'power_oos',
              channel,
              value: power,
              limit: deviceLimits.maxPower,
              unit: 'W'
            });
          }
        }
      });
    };

    unsubscribeWave = connection.registerPacketHandler(PackType.WAVE, (packet) => {
      const decoded = decodePacket(packet);
      if (!decoded || !isWavePacket(decoded)) return;

      if (decoded.data.channel !== channel) {
        if (!ignoredChannels.has(decoded.data.channel)) {
          ignoredChannels.add(decoded.data.channel);
          log(`Ignoring wave data from channel ${decoded.data.channel}.`);
        }
        return;
      }

      if (!hasWaveData) {
        hasWaveData = true;
        log(`Receiving wave data for channel ${channel}...`);
      }

      const packetNs = recordNowNs();
      if (perfettoCapture && perfettoNowNs && lastWavePacketNs !== null) {
        const deltaNs = packetNs - lastWavePacketNs;
        if (deltaNs > DEFAULT_WAVE_GAP_NS) {
          perfettoCapture.recordAlert({
            type: 'delta_t_oos',
            channel,
            value: deltaNs / 1_000_000_000,
            limit: DEFAULT_WAVE_GAP_NS / 1_000_000_000,
            unit: 's',
            deltaNs
          });
        }
      }
      lastWavePacketNs = packetNs;

      const adjustedSamples = reconciler.pushPacket(decoded, packetNs);
      emitSamples(adjustedSamples);
    });

    writer.writeLine('time_s,voltage_v,current_a');
    log(
      `Recording ${alias} channel ${channel}${outputPath ? ` to ${outputPath}` : ' to stdout'}...`
    );

    let stopRequested = false;
    let resolveDone: (() => void) | null = null;

    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    onSigint = () => {
      void stop('interrupted');
    };

    const stop = async (reason: string) => {
      if (stopRequested) return;
      stopRequested = true;
      if (onSigint) process.removeListener('SIGINT', onSigint);
      if (durationTimer) {
        clearTimeout(durationTimer);
        durationTimer = null;
      }
      unsubscribeWave?.();
      unsubscribeWave = null;
      const remainingSamples = reconciler.flushAll();
      emitSamples(remainingSamples);
      if (unsubscribeRaw) {
        unsubscribeRaw();
      }
      if (unsubscribePacketObserver) {
        unsubscribePacketObserver();
      }
      connection.stopHeartbeat();
      await connection.disconnect();
      connectionClosed = true;
      await writer.close();
      writerClosed = true;
      if (perfettoCapture && perfettoPath) {
        await writeBinaryFile(perfettoPath, perfettoCapture.serialize());
        log(`Perfetto trace written to ${perfettoPath}.`);
      }
      const duration = reconciler.getLastEmittedNs() / 1_000_000_000;
      log(`Recording stopped (${reason}). ${pointCount} samples over ${duration.toFixed(3)}s.`);
      restoreConsole();
      resolveDone?.();
    };

    process.once('SIGINT', onSigint);
    if (durationSeconds && !replayPerfettoPath) {
      durationTimer = setTimeout(() => {
        void stop('duration elapsed');
      }, durationSeconds * 1000);
    }

    if (replayPerfettoPath) {
      const chunks = loadReplayChunks(replayPerfettoPath);
      const durationLimitNs = durationSeconds ? durationSeconds * 1_000_000_000 : null;
      const replayConnection = connection as ReplaySerialConnection;
      for (const chunk of chunks) {
        if (durationLimitNs !== null && chunk.timestampNs > durationLimitNs) {
          break;
        }
        replayClock?.setNowNs(chunk.timestampNs);
        replayConnection.ingestChunk(chunk.bytes);
      }
      await stop('replay complete');
      return;
    }

    await done;
  } catch (error) {
    if (onSigint) process.removeListener('SIGINT', onSigint);
    if (durationTimer) clearTimeout(durationTimer);
    unsubscribeWave?.();
    unsubscribeRaw?.();
    unsubscribePacketObserver?.();
    connection.stopHeartbeat();
    if (!connectionClosed) {
      await connection.disconnect().catch(() => undefined);
    }
    if (!writerClosed) {
      await writer.close().catch(() => undefined);
    }
    throw error;
  } finally {
    restoreConsole();
  }
}

function registerContextCommands(program: Command, registry: ContextRegistry): void {
  registry.getAmbiguousCategories().forEach((category) => {
    program
      .command(category)
      .description(`Ambiguous alias (${category}) – use ${category}1/${category}2 etc.`)
      .action(() => {
        const hints = registry.uniqueContextsByCategory[category]
          .map((ctx) => ctx.alias)
          .join(', ');
        throw new Error(
          `Multiple ${category.toUpperCase()} devices connected; specify one of: ${hints}`
        );
      });
  });

  registry.getAliases().forEach((alias) => {
    const context = registry.getContext(alias);
    if (!context) return;
    const command = program
      .command(alias)
      .description(`Control ${context.machineType} (${alias})`)
      .argument('[state]', 'Output state (on/off)')
      .option('--channel <number>', 'Channel index (0-5)')
      .option('--status', 'Print textual status')
      .option('--status-json', 'Print JSON status')
      .option('--set-voltage <voltage>', 'Set target voltage (V)')
      .option('--set-current <current>', 'Set target current (A)')
      .action(async (state: string | undefined, options: ContextCommandOptions) => {
        await handleContextCommand(alias, context, options, state);
      });

    command
      .command('record')
      .description('Record waveform data to CSV (stdout by default)')
      .option('--duration <sec>', 'Recording duration in seconds')
      .option('--output-csv <path>', 'Write CSV to a file instead of stdout')
      .option('--output-perfetto <path>', 'Write Perfetto trace to a file')
      .option('--replay-perfetto <path>', 'Replay raw chunks from a Perfetto trace instead of live serial')
      .action(async (options: RecordCommandOptions) => {
        await handleRecordCommand(alias, context, options);
      });
  });

  (['psu', 'load'] as DeviceCategory[]).forEach((category) => {
    if (registry.getAmbiguousCategories().includes(category)) {
      return;
    }
    if (registry.getContext(category)) {
      return;
    }
    program
      .command(category)
      .description(`No ${category.toUpperCase()} device detected`)
      .action(() => {
        throw new Error(
          `No ${category.toUpperCase()} device detected. Run \`devices\` to list available contexts.`
        );
      });
  });
}

program
  .name('mdp-cli')
  .description('Node CLI for the Miniware MDP PSU (reuses the WebUI packet helpers)')
  .version('0.1.0');

program
  .command('list')
  .description('List Miniware serial ports (filtered by vendor/product)')
  .action(async () => {
    const ports = await SerialPort.list();
    const matches = ports.filter(matchesMiniwarePort);
    if (matches.length === 0) {
      console.log('No Miniware serial ports detected.');
      return;
    }
    matches.forEach((port) => {
      console.log(`${port.path}  ${port.manufacturer ?? ''}`.trim());
    });
  });

program
  .command('watch')
  .description('Stream real-time channel updates (watch for CTRL+C)')
  .option('-p, --port <path>', 'Serial port path')
  .option('-i, --interval <ms>', 'Heartbeat interval in milliseconds', '1000')
  .action(async (options) => {
    const portPath = await resolvePort(options.port);
    const connection = new NodeSerialConnection({ portPath });
    await connection.connect();

    connection.startHeartbeat(() => createHeartbeatPacket(), Number(options.interval));

    const displaySynthState = (packet: number[]) => {
      const decoded = decodePacket(packet);
      if (!decoded) return;
      const processed = processSynthesizePacket(decoded);
      if (!processed) return;
      console.log(new Date().toISOString());
      processed.forEach((channel) => console.log(formatChannelLine(channel)));
      console.log('---');
    };

    const displayMachineState = (packet: number[]) => {
      const decoded = decodePacket(packet);
      if (!decoded) return;
      const info = processMachinePacket(decoded);
      if (info) {
        console.log(`Device: ${info.type}  LCD: ${info.hasLCD ? 'yes' : 'no'}`);
      }
    };

    const displayWaveStats = (packet: number[]) => {
      const decoded = decodePacket(packet);
      if (!decoded) return;
      const wave = processWavePacket(decoded);
      if (!wave) return;
      console.log(`Wave packet ch${wave.channel} (${wave.points.length} samples)`);
    };

    const unsubs = [
      connection.registerPacketHandler(PackType.SYNTHESIZE, displaySynthState),
      connection.registerPacketHandler(PackType.MACHINE, displayMachineState),
      connection.registerPacketHandler(PackType.WAVE, displayWaveStats)
    ];

    const cleanup = async () => {
      unsubs.forEach((unsub) => unsub());
      connection.stopHeartbeat();
      await connection.disconnect();
      process.exit(0);
    };

    process.once('SIGINT', cleanup);
    process.stdin.resume();

    console.log('Watching channel updates (CTRL+C to exit)...');
    await new Promise<void>(() => {
      // intentionally empty - keep the process alive until CTRL+C
    });
  });

program
  .command('machine')
  .description('Query the PSU machine type')
  .option('-p, --port <path>', 'Serial port path')
  .option('-t, --timeout <ms>', 'Response timeout in milliseconds', '2500')
  .action(async (options) => {
    const timeout = Number(options.timeout);
    const portPath = await resolvePort(options.port);
    const connection = new NodeSerialConnection({ portPath });
    await connection.connect();
    try {
      const response = await requestPacket(
        connection,
        PackType.MACHINE,
        createGetMachinePacket(),
        timeout
      );
      if (!response) {
        throw new Error('No machine response received');
      }
      const decoded = decodePacket(response);
      const info = decoded ? processMachinePacket(decoded) : null;
      if (!info) {
        throw new Error('Failed to decode machine packet');
      }
      console.log('Device Information:');
      console.log(`  Type : ${info.type}`);
      console.log(`  LCD  : ${info.hasLCD ? 'present' : 'absent'}`);
    } finally {
      await connection.disconnect();
    }
  });

program
  .command('set')
  .description('Set voltage/current targets for a channel')
  .option('-p, --port <path>', 'Serial port path')
  .option('-t, --target-current <current>', 'Target current in amperes')
  .option('-v, --target-voltage <voltage>', 'Target voltage in volts')
  .argument('<channel>', 'Channel index (0-5)')
  .action(async (channelArg, options) => {
    const channel = parseChannelArg(channelArg);
    if (options.targetVoltage === undefined && options.targetCurrent === undefined) {
      throw new Error('Provide --target-voltage, --target-current, or both');
    }
    const requestedVoltage = options.targetVoltage === undefined ? undefined : Number(options.targetVoltage);
    const requestedCurrent = options.targetCurrent === undefined ? undefined : Number(options.targetCurrent);

    const portPath = await resolvePort(options.port);
    const connection = new NodeSerialConnection({ portPath });
    await connection.connect();
    try {
      const baseline = await waitForChannelStatus(connection, channel);
      if (!baseline) throw new Error('No synthesize data received for the requested channel');
      const voltage = requestedVoltage ?? baseline.targetVoltage ?? baseline.voltage;
      const current = requestedCurrent ?? baseline.targetCurrent ?? baseline.current;
      if (voltage === undefined || current === undefined) {
        throw new Error('Unable to preserve the companion setpoint');
      }
      validateDeviceTargets(baseline.machineType ?? 'Unknown', voltage, current);

      await connection.sendPacket(createSetChannelPacket(channel));
      await delay(50);
      if (requestedVoltage !== undefined) {
        await connection.sendPacket(createSetVoltagePacket(channel, voltage, current));
        await delay(50);
      }
      if (requestedCurrent !== undefined) {
        await connection.sendPacket(createSetCurrentPacket(channel, voltage, current));
        await delay(50);
      }

      const acknowledged = await waitForChannelStatus(connection, channel);
      if (!acknowledged) throw new Error('Device did not acknowledge the setpoint command');
      if (requestedVoltage !== undefined) {
        assertAppliedTarget('Voltage target', acknowledged.targetVoltage, voltage);
      }
      if (requestedCurrent !== undefined) {
        assertAppliedTarget('Current target', acknowledged.targetCurrent, current);
      }
      console.log(`Set channel ${channel} to ${voltage.toFixed(3)}V / ${current.toFixed(3)}A`);
    } finally {
      await connection.disconnect();
    }
  });

program
  .command('output')
  .description('Toggle channel output state')
  .option('-p, --port <path>', 'Serial port path')
  .argument('<channel>', 'Channel index (0-5)')
  .argument('<state>', 'on or off')
  .action(async (channelArg, state, options) => {
    const channel = parseChannelArg(channelArg);
    const normalized = state.toLowerCase();
    if (!['on', 'off'].includes(normalized)) {
      throw new Error('State must be "on" or "off"');
    }

    const portPath = await resolvePort(options.port);
    const connection = new NodeSerialConnection({ portPath });
    await connection.connect();
    try {
      await connection.sendPacket(createSetChannelPacket(channel));
      await delay(50);
      const enabled = normalized === 'on';
      await connection.sendPacket(createSetOutputPacket(channel, enabled));
      await delay(50);
      const acknowledged = await waitForChannelStatus(connection, channel);
      if (!acknowledged || acknowledged.isOutput !== enabled) {
        throw new Error(`Device did not acknowledge output ${normalized.toUpperCase()}`);
      }
      console.log(`Channel ${channel} output ${acknowledged.isOutput ? 'ON' : 'OFF'}`);
    } finally {
      await connection.disconnect();
    }
  });

async function run(): Promise<void> {
  let registry: ContextRegistry | null = null;

  try {
    const contexts = await discoverDeviceContexts();

    if (contexts.length > 0) {
      registry = new ContextRegistry(contexts);
      registerContextCommands(program, registry);
    } else {
      console.warn('No Miniware device contexts detected; context commands are disabled.');
    }
  } catch (error) {
    console.warn('Device context discovery failed:', error instanceof Error ? error.message : error);
  }

  program
    .command('devices')
    .description('List available device contexts')
    .action(() => {
      if (!registry) {
        console.log('No device contexts available. Run `list` to inspect serial ports.');
        return;
      }
      registry.describe().forEach((line) => console.log(line));
    });

  await program.parseAsync(process.argv);
}

run().catch((error) => {
  console.error('Unhandled error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
