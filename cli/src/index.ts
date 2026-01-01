import { Command } from 'commander';
import { SerialPort } from 'serialport';
import { NodeSerialConnection } from './node-serial';
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
  isMachinePacket
} from '../../webui/src/lib/packet-decoder';
import { PackType } from '../../webui/src/lib/types';
import { debugEnabled } from '../../webui/src/lib/debug-logger';
import { getMachineTypeString } from '../../webui/src/lib/machine-utils';

const TARGET_VENDOR_ID = 0x0416;
const TARGET_PRODUCT_ID = 0xdc01;

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

function matchesMiniwarePort(port: SerialPort.PortInfo): boolean {
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
  const voltage = update.voltage.toFixed(3);
  const current = update.current.toFixed(3);
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

type DeviceCategory = 'psu' | 'load';

interface DeviceContextParams {
  portPath: string;
  category: DeviceCategory;
  machineType: string;
}

interface DeviceContext extends DeviceContextParams {
  alias: string;
  index: number;
}

class ContextRegistry {
  private readonly aliasMap = new Map<string, DeviceContext>();
  private readonly ambiguousCategories = new Set<DeviceCategory>();
  public readonly uniqueContextsByCategory: Record<DeviceCategory, DeviceContext[]> = {
    psu: [],
    load: []
  };

  constructor(contexts: DeviceContextParams[]) {
    const groups: Record<DeviceCategory, DeviceContextParams[]> = {
      psu: [],
      load: []
    };
    contexts.forEach((context) => {
      groups[context.category].push(context);
    });

    (['psu', 'load'] as DeviceCategory[]).forEach((category) => {
      const devices = groups[category];
      if (devices.length === 0) {
        return;
      }

      if (devices.length > 1) {
        this.ambiguousCategories.add(category);
      }

      devices.forEach((context, index) => {
        const alias = devices.length === 1 ? category : `${category}${index + 1}`;
        const device: DeviceContext = {
          ...context,
          alias,
          index: index + 1
        };
        this.aliasMap.set(alias, device);
        this.pushUnique(device);
      });
    });
  }

  private pushUnique(context: DeviceContext): void {
    const list = this.uniqueContextsByCategory[context.category];
    if (!list.some((entry) => entry.portPath === context.portPath)) {
      list.push(context);
    }
  }

  getContext(alias: string): DeviceContext | undefined {
    return this.aliasMap.get(alias);
  }

  getAliases(): string[] {
    return Array.from(this.aliasMap.keys()).sort();
  }

  getAmbiguousCategories(): DeviceCategory[] {
    return Array.from(this.ambiguousCategories);
  }

  describe(): string[] {
    const lines: string[] = ['Detected device contexts:'];
    this.getAliases().forEach((alias) => {
      const ctx = this.aliasMap.get(alias);
      if (!ctx) return;
      lines.push(`  ${alias} -> ${ctx.category.toUpperCase()} (${ctx.machineType})`);
    });

    if (this.ambiguousCategories.size > 0) {
      lines.push('Ambiguous names:');
      this.getAmbiguousCategories().forEach((category) => {
        const hints = this.uniqueContextsByCategory[category].map((ctx) => ctx.alias).join(', ');
        lines.push(`  ${category} (use ${hints})`);
      });
    }

    return lines;
  }
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

  return processed[0].machineType;
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
      const category: DeviceCategory = machineType.toLowerCase().includes('l1060') ? 'load' : 'psu';
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

interface ContextCommandOptions {
  channel?: string;
  status?: boolean;
  statusJson?: boolean;
  setVoltage?: string;
  setCurrent?: string;
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
      const lines = [
        `${alias} (${context.machineType}) channel ${channel}:`,
        `  Online: ${finalStatus.online ? 'YES' : 'NO'}`,
        `  Voltage: ${finalStatus.voltage.toFixed(3)} V (target ${finalStatus.targetVoltage.toFixed(3)} V)`,
        `  Current: ${finalStatus.current.toFixed(3)} A (target ${finalStatus.targetCurrent.toFixed(3)} A)`,
        `  Temperature: ${finalStatus.temperature.toFixed(1)} °C`,
        `  Output: ${finalStatus.isOutput ? 'ON' : 'OFF'}`,
        `  Mode: ${finalStatus.mode}`
      ];
      lines.forEach((line) => console.log(line));
    } else if (wantsSets && finalStatus && !options.status && !options.statusJson) {
      console.log(
        `${alias} channel ${channel} updated: ${finalStatus.voltage.toFixed(3)} V / ${finalStatus.current.toFixed(3)} A`
      );
    } else if (wantsOutput && !wantsStatus && !options.statusJson && !wantsSets) {
      console.log(`${alias} channel ${channel} output ${normalizedOutputState?.toUpperCase()}`);
    }
  } finally {
    await connection.disconnect();
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
    program
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
