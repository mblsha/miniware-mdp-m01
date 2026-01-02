/**
 * Mock serial connection for testing MDP CLI without real hardware.
 * Simulates device responses based on configured device type.
 */

export type PacketHandler = (packet: number[]) => void;

export type MockDeviceType = 'P906' | 'L1060' | 'M01' | 'M02';

export interface MockDeviceConfig {
  portPath: string;
  deviceType: MockDeviceType;
  channels?: MockChannelConfig[];
}

export interface MockChannelConfig {
  channel: number;
  voltage: number;
  current: number;
  temperature: number;
  isOutput: boolean;
  online: boolean;
}

const DEFAULT_CHANNEL_CONFIG: MockChannelConfig = {
  channel: 0,
  voltage: 5.0,
  current: 1.0,
  temperature: 25.0,
  isOutput: false,
  online: true
};

/**
 * Creates a synthesize packet response for the given device configuration.
 */
export function createSynthesizeResponse(config: MockDeviceConfig): number[] {
  const channels = config.channels ?? [DEFAULT_CHANNEL_CONFIG];

  // Packet header: [0x5A, 0x5A, type, size, channel, checksum, ...data]
  // Synthesize = 0x11, size = 6 + 150 (6 channels * 25 bytes each) = 156
  const type = 0x11;
  const size = 156;
  const headerChannel = 0xEE;

  const data: number[] = [];

  // Build 6 channel data blocks (25 bytes each)
  for (let i = 0; i < 6; i++) {
    const ch = channels.find((c) => c.channel === i) ?? { ...DEFAULT_CHANNEL_CONFIG, channel: i, online: false };

    const voltageMv = Math.round((ch.voltage ?? 0) * 1000);
    const currentMa = Math.round((ch.current ?? 0) * 1000);
    const tempRaw = Math.round((ch.temperature ?? 25) * 10);
    const machineTypeRaw = getMachineTypeRaw(config.deviceType);

    data.push(i); // num (channel)
    data.push(voltageMv & 0xff);
    data.push((voltageMv >> 8) & 0xff); // outVoltage (LE)
    data.push(currentMa & 0xff);
    data.push((currentMa >> 8) & 0xff); // outCurrent (LE)
    data.push(0, 0); // inVoltage (LE)
    data.push(0, 0); // inCurrent (LE)
    data.push(voltageMv & 0xff);
    data.push((voltageMv >> 8) & 0xff); // setVoltage (LE)
    data.push(currentMa & 0xff);
    data.push((currentMa >> 8) & 0xff); // setCurrent (LE)
    data.push(tempRaw & 0xff);
    data.push((tempRaw >> 8) & 0xff); // tempRaw (LE)
    data.push(ch.online ? 1 : 0); // online
    data.push(machineTypeRaw); // type
    data.push(0); // lock
    data.push(0); // statusLoad/statusPsu
    data.push(ch.isOutput ? 1 : 0); // outputOn
    data.push(0, 0, 0); // color (3 bytes)
    data.push(0); // error
    data.push(0xff); // end marker
  }

  // Calculate checksum (XOR of data bytes)
  let checksum = 0;
  for (const byte of data) {
    checksum ^= byte;
  }

  return [0x5a, 0x5a, type, size, headerChannel, checksum, ...data];
}

/**
 * Creates a machine packet response.
 */
export function createMachineResponse(deviceType: MockDeviceType): number[] {
  const type = 0x15; // PACK_MACHINE
  const size = 7;
  const headerChannel = 0xEE;
  const machineTypeRaw = deviceType === 'M01' ? 0x10 : 0x11;

  const data = [machineTypeRaw];
  let checksum = 0;
  for (const byte of data) {
    checksum ^= byte;
  }

  return [0x5a, 0x5a, type, size, headerChannel, checksum, ...data];
}

function getMachineTypeRaw(deviceType: MockDeviceType): number {
  switch (deviceType) {
    case 'P906':
      return 2;
    case 'L1060':
      return 3;
    case 'M01':
      return 16;
    case 'M02':
      return 17;
    default:
      return 2;
  }
}

/**
 * Mock serial connection that simulates MDP device responses.
 */
export class MockNodeSerialConnection {
  private readonly config: MockDeviceConfig;
  private readonly packetHandlers = new Map<number, PacketHandler[]>();
  private readonly sentPackets: number[][] = [];
  private connected = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: MockDeviceConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.connected = false;
    this.packetHandlers.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendPacket(packet: number[] | Uint8Array): Promise<void> {
    if (!this.connected) {
      throw new Error('Serial port not open');
    }

    const numericPacket = packet instanceof Uint8Array ? Array.from(packet) : packet;
    this.sentPackets.push(numericPacket);

    // Simulate device response based on packet type
    const packetType = numericPacket[2];
    await this.simulateResponse(packetType);
  }

  private async simulateResponse(requestType: number): Promise<void> {
    // GET_MACHINE (0x21) -> respond with MACHINE (0x15)
    if (requestType === 0x21) {
      const response = createMachineResponse(this.config.deviceType);
      this.dispatchPacket(response);
    }
    // HEARTBEAT (0x22) -> respond with SYNTHESIZE (0x11)
    else if (requestType === 0x22) {
      const response = createSynthesizeResponse(this.config);
      this.dispatchPacket(response);
    }
    // SET_CH (0x19), SET_V (0x1A), SET_I (0x1B), SET_ISOUTPUT (0x16)
    // These don't get immediate responses in the real protocol,
    // but we can optionally respond with a synthesize packet
  }

  private dispatchPacket(packet: number[]): void {
    const packetType = packet[2];
    const handlers = this.packetHandlers.get(packetType) ?? [];
    for (const handler of handlers) {
      // In test mocks, handler errors should fail the test, not be swallowed
      handler(packet);
    }
  }

  registerPacketHandler(packetType: number, handler: PacketHandler): () => void {
    if (!this.packetHandlers.has(packetType)) {
      this.packetHandlers.set(packetType, []);
    }
    const handlers = this.packetHandlers.get(packetType)!;
    handlers.push(handler);

    return () => {
      const list = this.packetHandlers.get(packetType);
      if (!list) return;
      const index = list.indexOf(handler);
      if (index >= 0) {
        list.splice(index, 1);
      }
      if (list.length === 0) {
        this.packetHandlers.delete(packetType);
      }
    };
  }

  waitForPacket(packetType: number, timeoutMs = 3000): Promise<number[] | null> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const unsubscribe = this.registerPacketHandler(packetType, (packet) => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        unsubscribe();
        resolve(packet);
      });

      timer = setTimeout(() => {
        unsubscribe();
        resolve(null);
      }, timeoutMs);
    });
  }

  startHeartbeat(generator: () => number[], intervalMs = 1000): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendPacket(generator()).catch((err) => console.error('Heartbeat failed:', err));
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Returns all packets sent through this connection (for test assertions) */
  getSentPackets(): number[][] {
    return [...this.sentPackets];
  }

  /** Clears the sent packets history */
  clearSentPackets(): void {
    this.sentPackets.length = 0;
  }

  /** Updates the channel configuration for dynamic test scenarios */
  updateChannel(channelIndex: number, update: Partial<MockChannelConfig>): void {
    if (!this.config.channels) {
      this.config.channels = [];
    }
    const existing = this.config.channels.find((c) => c.channel === channelIndex);
    if (existing) {
      Object.assign(existing, update);
    } else {
      this.config.channels.push({
        ...DEFAULT_CHANNEL_CONFIG,
        channel: channelIndex,
        ...update
      });
    }
  }

  /** Triggers a synthesize packet dispatch (simulates device pushing data) */
  triggerSynthesizePacket(): void {
    const response = createSynthesizeResponse(this.config);
    this.dispatchPacket(response);
  }
}

/**
 * Factory function to create mock connections for multiple devices.
 */
export function createMockDevices(
  configs: MockDeviceConfig[]
): Map<string, MockNodeSerialConnection> {
  const connections = new Map<string, MockNodeSerialConnection>();
  for (const config of configs) {
    connections.set(config.portPath, new MockNodeSerialConnection(config));
  }
  return connections;
}
