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
} from '../../mdp-webui/src/lib/packet-encoder';
import {
  decodePacket,
  processMachinePacket,
  processSynthesizePacket,
  processWavePacket,
  type ChannelUpdate
} from '../../mdp-webui/src/lib/packet-decoder';
import { PackType } from '../../mdp-webui/src/lib/types';

const TARGET_VENDOR_ID = 0x0416;
const TARGET_PRODUCT_ID = 0xdc01;

const program = new Command();

function parseNumericId(value?: string | number): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.startsWith('0x')) {
    return Number.parseInt(trimmed, 16);
  }

  return Number.parseInt(trimmed, 10);
}

function matchesMiniwarePort(port: SerialPort.PortInfo): boolean {
  const vendorId = parseNumericId(port.vendorId);
  const productId = parseNumericId(port.productId);

  if (Number.isFinite(vendorId) && Number.isFinite(productId)) {
    if (vendorId === TARGET_VENDOR_ID && productId === TARGET_PRODUCT_ID) {
      return true;
    }
  }

  const manufacturer = port.manufacturer?.toLowerCase() ?? '';
  return manufacturer.includes('miniware') || manufacturer.includes('stmicroelectronics');
}

async function getAutoPort(): Promise<string> {
  const ports = await SerialPort.list();
  if (ports.length === 0) {
    throw new Error('No serial ports detected');
  }

  const match = ports.find(matchesMiniwarePort);
  const portInfo = match ?? ports[0];
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

program
  .name('mdp-cli')
  .description('Node CLI for the Miniware MDP PSU (reuses the WebUI packet helpers)')
  .version('0.1.0');

program
  .command('list')
  .description('List available serial ports')
  .action(async () => {
    const ports = await SerialPort.list();
    if (ports.length === 0) {
      console.log('No serial ports detected.');
      return;
    }
    ports.forEach((port) => {
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
    await connection.sendPacket(createGetMachinePacket());
    const response = await connection.waitForPacket(PackType.MACHINE, timeout);
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

    const connection = new NodeSerialConnection({ portPath: options.port });
    await connection.connect();

    await connection.sendPacket(createSetChannelPacket(channel));
    await delay(50);
    await connection.sendPacket(createSetOutputPacket(channel, normalized === 'on'));

    console.log(`Channel ${channel} output ${normalized.toUpperCase()}`);
    await connection.disconnect();
  });

program.parseAsync(process.argv);
