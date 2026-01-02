import { createWriteStream } from 'node:fs';
import { format } from 'node:util';
import { Command } from 'commander';
import { SerialPort } from 'serialport';
import { get } from 'svelte/store';
import { NodeSerialConnection } from './node-serial';
import { ContextRegistry, categorizeDevice, type DeviceContext, type DeviceContextParams } from './context-registry';
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
  type ChannelUpdate,
  type DecodedPacket,
  isMachinePacket,
  isWavePacket
} from '../../webui/src/lib/packet-decoder';
import { PackType } from '../../webui/src/lib/types';
import { debugEnabled } from '../../webui/src/lib/debug-logger';
import { getMachineTypeString } from '../../webui/src/lib/machine-utils';

const TARGET_VENDOR_ID = 0x0416;
const TARGET_PRODUCT_ID = 0xdc01;

type PortInfo = Awaited<ReturnType<typeof SerialPort.list>>[number];

const program = new Command();

debugEnabled.set(false);

program.option('--debug', 'Enable Kaitai/debug logging');

program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  debugEnabled.set(Boolean(opts.debug));
});

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

type CsvWriter = {
  writeLine: (line: string) => void;
  close: () => Promise<void>;
};

function createCsvWriter(outputPath?: string): CsvWriter {
  if (outputPath) {
    const stream = createWriteStream(outputPath, { encoding: 'utf8' });
    return {
      writeLine: (line) => {
        stream.write(`${line}\n`);
      },
      close: () =>
        new Promise((resolve) => {
          stream.end(() => resolve());
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

async function detectMachineTypeFromSynthesize(
  connection: NodeSerialConnection,
  timeoutMs = 2500
): Promise<string | null> {
  try {
    await connection.sendPacket(createHeartbeatPacket());
  } catch {
    // ignore heartbeat failure during detection
  }

  const packet = await connection.waitForPacket(PackType.SYNTHESIZE, timeoutMs);
  if (!packet) {
    return null;
  }

  const decoded = decodePacket(packet);
  if (!decoded) {
    return null;
  }

  const processed = processSynthesizePacket(decoded);
  if (!processed || processed.length === 0) {
    return null;
  }

  return processed[0].machineType ?? null;
}

async function discoverDeviceContexts(): Promise<DeviceContextParams[]> {
  const ports = (await SerialPort.list()).filter(matchesMiniwarePort);
  const contexts: DeviceContextParams[] = [];

  for (const port of ports) {
    const connection = new NodeSerialConnection({ portPath: port.path });
    try {
      await connection.connect();
      await connection.sendPacket(createGetMachinePacket());
      const response = await connection.waitForPacket(PackType.MACHINE, 5000);
      if (!response) {
        console.warn(`No machine response from ${port.path}; defaulting to PSU context.`);
        contexts.push({
          portPath: port.path,
          category: 'psu',
          machineType: 'Unknown'
        });
        continue;
      }
      const decoded = decodePacket(response);
      const info = decoded ? processMachinePacket(decoded) : null;
      if (!info) {
        console.warn(`Unable to decode machine packet from ${port.path}; defaulting to PSU context.`);
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
      const channelMachineTypes = await detectMachineTypeFromSynthesize(connection);
      const machineType = channelMachineTypes ?? fallbackLabel ?? info.type;
      const category = categorizeDevice(machineType);
      contexts.push({
        portPath: port.path,
        category,
        machineType
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
  const packet = await connection.waitForPacket(PackType.SYNTHESIZE, timeoutMs);
  if (!packet) {
    return null;
  }

  const decoded = decodePacket(packet);
  if (!decoded) {
    return null;
  }

  const processed = processSynthesizePacket(decoded);
  if (!processed || processed.length === 0) {
    return null;
  }

  return processed[channel] ?? processed[0];
}

type WaveSample = {
  timeSeconds: number;
  voltage: number;
  current: number;
};

function extractWaveSamples(
  packet: DecodedPacket,
  runningTimeUs: number
): { samples: WaveSample[]; nextRunningTimeUs: number } | null {
  if (!isWavePacket(packet)) return null;

  const wave = packet.data;
  const samples: WaveSample[] = [];
  const samplesPerGroup = packet.size === 126 ? 2 : packet.size === 206 ? 4 : 0;

  wave.groups.forEach((group) => {
    const groupElapsedTimeUs = group.timestamp / 10;
    const pointsInGroup = samplesPerGroup || group.items.length || 1;
    const timePerSampleUs = pointsInGroup > 0 ? groupElapsedTimeUs / pointsInGroup : 0;

    for (let i = 0; i < pointsInGroup; i++) {
      const item = group.items[i];
      if (!item) break;
      const sampleTimeUs = runningTimeUs + i * timePerSampleUs;
      samples.push({
        timeSeconds: sampleTimeUs / 1_000,
        voltage: item.voltage,
        current: item.current
      });
    }

    runningTimeUs += groupElapsedTimeUs;
  });

  return { samples, nextRunningTimeUs: runningTimeUs };
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
}

async function handleContextCommand(
  alias: string,
  context: DeviceContext,
  options: ContextCommandOptions,
  outputState?: string
): Promise<void> {
  const channel = parseChannelArg(options.channel ?? '0');
  const wantsStatus = Boolean(options.status || options.statusJson);
  const wantsSets = Boolean(options.setVoltage || options.setCurrent);
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
    const baseline = wantsStatus || wantsSets ? await waitForChannelStatus(connection, channel) : null;
    if ((wantsStatus || wantsSets) && !baseline) {
      throw new Error('No synthesize data received yet for the requested channel');
    }

    const parsedVoltage = options.setVoltage !== undefined ? Number(options.setVoltage) : undefined;
    const parsedCurrent = options.setCurrent !== undefined ? Number(options.setCurrent) : undefined;

    if (parsedVoltage !== undefined && !Number.isFinite(parsedVoltage)) {
      throw new Error('Target voltage must be a valid number');
    }

    if (parsedCurrent !== undefined && !Number.isFinite(parsedCurrent)) {
      throw new Error('Target current must be a valid number');
    }

    if (parsedVoltage !== undefined) {
      const currentTarget =
        parsedCurrent ??
        baseline?.targetCurrent ??
        baseline?.current ??
        0;
      await connection.sendPacket(createSetChannelPacket(channel));
      await delay(50);
      await connection.sendPacket(createSetVoltagePacket(channel, parsedVoltage, currentTarget));
      await delay(50);
    }

    if (parsedCurrent !== undefined) {
      const voltageTarget =
        parsedVoltage ??
        baseline?.targetVoltage ??
        baseline?.voltage ??
        0;
      await connection.sendPacket(createSetChannelPacket(channel));
      await delay(50);
      await connection.sendPacket(createSetCurrentPacket(channel, voltageTarget, parsedCurrent));
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

    const finalStatus =
      wantsStatus || wantsSets ? await waitForChannelStatus(connection, channel) : baseline;

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
      console.log(`${alias} channel ${channel} output ${normalizedOutputState?.toUpperCase()}`);
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
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const restoreConsole = () => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
  };
  console.log = (...args: unknown[]) => {
    process.stderr.write(`${format(...args)}\n`);
  };
  console.warn = (...args: unknown[]) => {
    process.stderr.write(`${format(...args)}\n`);
  };

  const channel = parseChannelArg('0');
  const durationSeconds = parseDurationSeconds(options.duration);
  const outputPath = options.outputCsv;
  const writer = createCsvWriter(outputPath);
  const log = (message: string) => {
    process.stderr.write(`${message}\n`);
  };

  if (get(debugEnabled)) {
    debugEnabled.set(false);
    log('Debug logging disabled during recording to keep CSV output clean.');
  }

  const connection = new NodeSerialConnection({ portPath: context.portPath });
  try {
    await connection.connect();
    await connection.sendPacket(createSetChannelPacket(channel));
    await delay(50);

    connection.startHeartbeat(() => createHeartbeatPacket(), 1000);

    let runningTimeUs = 0;
    let pointCount = 0;
    let hasWaveData = false;
    const ignoredChannels = new Set<number>();

    const unsubscribe = connection.registerPacketHandler(PackType.WAVE, (packet) => {
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

      const result = extractWaveSamples(decoded, runningTimeUs);
      if (!result) return;

      runningTimeUs = result.nextRunningTimeUs;
      result.samples.forEach((sample) => {
        writer.writeLine(
          `${sample.timeSeconds.toFixed(6)},${sample.voltage.toFixed(6)},${sample.current.toFixed(6)}`
        );
        pointCount += 1;
      });
    });

    writer.writeLine('time_s,voltage_v,current_a');
    log(
      `Recording ${alias} channel ${channel}${outputPath ? ` to ${outputPath}` : ' to stdout'}...`
    );

    let stopRequested = false;
    let durationTimer: ReturnType<typeof setTimeout> | null = null;
    let resolveDone: (() => void) | null = null;

    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const onSigint = () => {
      void stop('interrupted');
    };

    const stop = async (reason: string) => {
      if (stopRequested) return;
      stopRequested = true;
      process.removeListener('SIGINT', onSigint);
      if (durationTimer) {
        clearTimeout(durationTimer);
        durationTimer = null;
      }
      unsubscribe();
      connection.stopHeartbeat();
      await connection.disconnect();
      await writer.close();
      const duration = runningTimeUs / 1_000_000;
      log(`Recording stopped (${reason}). ${pointCount} samples over ${duration.toFixed(3)}s.`);
      restoreConsole();
      resolveDone?.();
    };

    process.once('SIGINT', onSigint);
    if (durationSeconds) {
      durationTimer = setTimeout(() => {
        void stop('duration elapsed');
      }, durationSeconds * 1000);
    }

    await done;
  } catch (error) {
    restoreConsole();
    throw error;
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
      .option('--channel <number>', 'Channel index (0-5)', '0')
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
      .action(async (options: RecordCommandOptions) => {
        await handleRecordCommand(alias, context, options);
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
    const responsePromise = connection.waitForPacket(PackType.MACHINE, timeout);
    await connection.sendPacket(createGetMachinePacket());
    const response = await responsePromise;
    if (!response) {
      console.log('No machine response received.');
      await connection.disconnect();
      return;
    }
    const decoded = decodePacket(response);
    const info = decoded ? processMachinePacket(decoded) : null;
    if (info) {
      console.log('Device Information:');
      console.log(`  Type : ${info.type}`);
      console.log(`  LCD  : ${info.hasLCD ? 'present' : 'absent'}`);
    } else {
      console.log('Failed to decode machine packet.');
    }
    await connection.disconnect();
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
    const voltage = options.targetVoltage ? Number(options.targetVoltage) : 0;
    const current = options.targetCurrent ? Number(options.targetCurrent) : 0;
    if (!Number.isFinite(voltage) || !Number.isFinite(current)) {
      throw new Error('Voltage and current must be valid numbers');
    }

    const portPath = await resolvePort(options.port);
    const connection = new NodeSerialConnection({ portPath });
    await connection.connect();

    await connection.sendPacket(createSetChannelPacket(channel));
    await delay(50);
    await connection.sendPacket(createSetVoltagePacket(channel, voltage, current));
    await delay(50);
    await connection.sendPacket(createSetCurrentPacket(channel, voltage, current));

    console.log(`Set channel ${channel} to ${voltage.toFixed(2)}V / ${current.toFixed(3)}A`);
    await connection.disconnect();
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

    await connection.sendPacket(createSetChannelPacket(channel));
    await delay(50);
    await connection.sendPacket(createSetOutputPacket(channel, normalized === 'on'));

    console.log(`Channel ${channel} output ${normalized.toUpperCase()}`);
    await connection.disconnect();
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
