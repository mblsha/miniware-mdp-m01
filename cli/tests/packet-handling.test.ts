import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MockNodeSerialConnection,
  createSynthesizeResponse,
  createMachineResponse,
  type MockDeviceConfig,
  type MockChannelConfig
} from './mocks/mock-serial';
import {
  createSetChannelPacket,
  createSetVoltagePacket,
  createSetCurrentPacket,
  createSetOutputPacket,
  createHeartbeatPacket,
  createGetMachinePacket,
  PacketType
} from './helpers/packet-helpers';

describe('Packet Creation Tests', () => {
  describe('Packet Header Format', () => {
    it('should create packets with correct header structure', () => {
      const packet = createSetChannelPacket(0);

      // Header bytes
      expect(packet[0]).toBe(0x5a); // Magic byte 1
      expect(packet[1]).toBe(0x5a); // Magic byte 2
      expect(packet[2]).toBe(PacketType.SET_CH); // Type
      expect(packet[3]).toBe(6); // Size (header only, no data)
      expect(packet[4]).toBe(0); // Channel
      expect(packet[5]).toBe(0); // Checksum (XOR of empty data = 0)
    });

    it('should calculate correct packet size for data packets', () => {
      // SET_V has 4 bytes of data (2 voltage + 2 current)
      const setVPacket = createSetVoltagePacket(0, 5.0, 1.0);
      expect(setVPacket[3]).toBe(10); // 6 header + 4 data

      // SET_ISOUTPUT has 1 byte of data
      const outputPacket = createSetOutputPacket(0, true);
      expect(outputPacket[3]).toBe(7); // 6 header + 1 data

      // HEARTBEAT has no data
      const heartbeatPacket = createHeartbeatPacket();
      expect(heartbeatPacket[3]).toBe(6); // 6 header + 0 data
    });

    it('should use 0xEE for broadcast channel', () => {
      const heartbeat = createHeartbeatPacket();
      expect(heartbeat[4]).toBe(0xee);

      const getMachine = createGetMachinePacket();
      expect(getMachine[4]).toBe(0xee);
    });
  });

  describe('Checksum Calculation', () => {
    it('should calculate correct checksum for empty data', () => {
      const packet = createSetChannelPacket(0);
      expect(packet[5]).toBe(0); // XOR of no bytes = 0
    });

    it('should calculate correct checksum for single byte data', () => {
      const packetOn = createSetOutputPacket(0, true);
      expect(packetOn[5]).toBe(1); // XOR of [1] = 1

      const packetOff = createSetOutputPacket(0, false);
      expect(packetOff[5]).toBe(0); // XOR of [0] = 0
    });

    it('should calculate correct checksum for multi-byte data', () => {
      // 5V = 5000mV = 0x1388, 1A = 1000mA = 0x03E8
      // Data: [0x88, 0x13, 0xE8, 0x03]
      // XOR: 0x88 ^ 0x13 ^ 0xE8 ^ 0x03 = 0x60
      const packet = createSetVoltagePacket(0, 5.0, 1.0);
      const expectedChecksum = 0x88 ^ 0x13 ^ 0xe8 ^ 0x03;
      expect(packet[5]).toBe(expectedChecksum);
    });
  });

  describe('Voltage/Current Encoding', () => {
    it('should encode whole volt/amp values correctly', () => {
      const packet = createSetVoltagePacket(0, 5.0, 1.0);
      // 5V = 5000mV = 0x1388 (little-endian: 0x88, 0x13)
      expect(packet[6]).toBe(0x88);
      expect(packet[7]).toBe(0x13);
      // 1A = 1000mA = 0x03E8 (little-endian: 0xE8, 0x03)
      expect(packet[8]).toBe(0xe8);
      expect(packet[9]).toBe(0x03);
    });

    it('should encode decimal volt/amp values correctly', () => {
      const packet = createSetVoltagePacket(0, 3.3, 0.5);
      // 3.3V = 3300mV = 0x0CE4 (little-endian: 0xE4, 0x0C)
      expect(packet[6]).toBe(0xe4);
      expect(packet[7]).toBe(0x0c);
      // 0.5A = 500mA = 0x01F4 (little-endian: 0xF4, 0x01)
      expect(packet[8]).toBe(0xf4);
      expect(packet[9]).toBe(0x01);
    });

    it('should handle high precision values with rounding', () => {
      const packet = createSetVoltagePacket(0, 3.333, 0.567);
      // 3.333V rounds to 3333mV = 0x0D05
      expect(packet[6]).toBe(0x05);
      expect(packet[7]).toBe(0x0d);
      // 0.567A rounds to 567mA = 0x0237
      expect(packet[8]).toBe(0x37);
      expect(packet[9]).toBe(0x02);
    });
  });
});

describe('Mock Packet Response Tests', () => {
  describe('Synthesize Response Generation', () => {
    it('should generate valid synthesize packet header', () => {
      const config: MockDeviceConfig = {
        portPath: '/dev/ttyUSB0',
        deviceType: 'P906'
      };
      const packet = createSynthesizeResponse(config);

      expect(packet[0]).toBe(0x5a);
      expect(packet[1]).toBe(0x5a);
      expect(packet[2]).toBe(0x11); // SYNTHESIZE type
      expect(packet[3]).toBe(156); // 6 header + 150 data (6 channels * 25 bytes)
      expect(packet[4]).toBe(0xee); // Broadcast channel
    });

    it('should encode channel voltage/current correctly', () => {
      const config: MockDeviceConfig = {
        portPath: '/dev/ttyUSB0',
        deviceType: 'P906',
        channels: [{ channel: 0, voltage: 5.0, current: 1.0, temperature: 25, isOutput: true, online: true }]
      };
      const packet = createSynthesizeResponse(config);

      // Channel 0 data starts at index 6
      const ch0Start = 6;

      // Channel number
      expect(packet[ch0Start]).toBe(0);

      // Voltage: 5V = 5000mV (little-endian)
      expect(packet[ch0Start + 1]).toBe(0x88); // 5000 & 0xFF
      expect(packet[ch0Start + 2]).toBe(0x13); // 5000 >> 8

      // Current: 1A = 1000mA (little-endian)
      expect(packet[ch0Start + 3]).toBe(0xe8); // 1000 & 0xFF
      expect(packet[ch0Start + 4]).toBe(0x03); // 1000 >> 8
    });

    it('should encode temperature correctly', () => {
      const config: MockDeviceConfig = {
        portPath: '/dev/ttyUSB0',
        deviceType: 'P906',
        channels: [{ channel: 0, voltage: 5.0, current: 1.0, temperature: 35.5, isOutput: false, online: true }]
      };
      const packet = createSynthesizeResponse(config);

      const ch0Start = 6;
      // Temperature: 35.5°C = 355 raw (little-endian)
      // Position: ch0Start + 13 and ch0Start + 14
      expect(packet[ch0Start + 13]).toBe(355 & 0xff); // 0x63
      expect(packet[ch0Start + 14]).toBe((355 >> 8) & 0xff); // 0x01
    });

    it('should encode output state correctly', () => {
      const configOn: MockDeviceConfig = {
        portPath: '/dev/ttyUSB0',
        deviceType: 'P906',
        channels: [{ channel: 0, voltage: 5.0, current: 1.0, temperature: 25, isOutput: true, online: true }]
      };
      const packetOn = createSynthesizeResponse(configOn);

      const configOff: MockDeviceConfig = {
        portPath: '/dev/ttyUSB0',
        deviceType: 'P906',
        channels: [{ channel: 0, voltage: 5.0, current: 1.0, temperature: 25, isOutput: false, online: true }]
      };
      const packetOff = createSynthesizeResponse(configOff);

      const ch0Start = 6;
      // Output state is at position ch0Start + 19 (see synthesize packet format)
      // 0: num, 1-2: outVoltage, 3-4: outCurrent, 5-6: inVoltage, 7-8: inCurrent,
      // 9-10: setVoltage, 11-12: setCurrent, 13-14: tempRaw, 15: online,
      // 16: type, 17: lock, 18: statusLoad/statusPsu, 19: outputOn
      expect(packetOn[ch0Start + 19]).toBe(1); // ON
      expect(packetOff[ch0Start + 19]).toBe(0); // OFF
    });

    it('should encode machine type correctly', () => {
      const p906Config: MockDeviceConfig = {
        portPath: '/dev/ttyUSB0',
        deviceType: 'P906'
      };
      const p906Packet = createSynthesizeResponse(p906Config);

      const l1060Config: MockDeviceConfig = {
        portPath: '/dev/ttyUSB1',
        deviceType: 'L1060'
      };
      const l1060Packet = createSynthesizeResponse(l1060Config);

      const ch0Start = 6;
      // Machine type is at position ch0Start + 16
      expect(p906Packet[ch0Start + 16]).toBe(2); // P906
      expect(l1060Packet[ch0Start + 16]).toBe(3); // L1060
    });

    it('should include all 6 channels', () => {
      const config: MockDeviceConfig = {
        portPath: '/dev/ttyUSB0',
        deviceType: 'P906'
      };
      const packet = createSynthesizeResponse(config);

      // Each channel is 25 bytes, verify channel numbers
      for (let i = 0; i < 6; i++) {
        const chStart = 6 + i * 25;
        expect(packet[chStart]).toBe(i); // Channel number
      }
    });
  });

  describe('Machine Response Generation', () => {
    it('should generate valid machine packet for M01', () => {
      const packet = createMachineResponse('M01');

      expect(packet[0]).toBe(0x5a);
      expect(packet[1]).toBe(0x5a);
      expect(packet[2]).toBe(0x15); // MACHINE type
      expect(packet[3]).toBe(7); // 6 header + 1 data
      expect(packet[6]).toBe(0x10); // M01 with LCD
    });

    it('should generate valid machine packet for M02', () => {
      const packet = createMachineResponse('M02');

      expect(packet[6]).toBe(0x11); // M02 without LCD
    });

    it('should generate valid machine packet for P906', () => {
      const packet = createMachineResponse('P906');

      // P906 is a PSU, should use M02 format
      expect(packet[6]).toBe(0x11);
    });

    it('should generate valid machine packet for L1060', () => {
      const packet = createMachineResponse('L1060');

      // L1060 is a Load, should use M02 format
      expect(packet[6]).toBe(0x11);
    });
  });
});

describe('Mock Connection Packet Handling', () => {
  let connection: MockNodeSerialConnection;

  beforeEach(async () => {
    const config: MockDeviceConfig = {
      portPath: '/dev/ttyUSB0',
      deviceType: 'P906',
      channels: [{ channel: 0, voltage: 5.0, current: 1.0, temperature: 25, isOutput: true, online: true }]
    };
    connection = new MockNodeSerialConnection(config);
    await connection.connect();
  });

  afterEach(async () => {
    await connection.disconnect();
  });

  describe('Packet Handler Registration', () => {
    it('should register and invoke packet handlers', async () => {
      let receivedPacket: number[] | null = null;

      connection.registerPacketHandler(0x11, (packet) => {
        receivedPacket = packet;
      });

      // Trigger synthesize response
      connection.triggerSynthesizePacket();

      expect(receivedPacket).not.toBeNull();
      expect(receivedPacket![2]).toBe(0x11);
    });

    it('should unregister handlers correctly', async () => {
      let callCount = 0;

      const unsubscribe = connection.registerPacketHandler(0x11, () => {
        callCount++;
      });

      connection.triggerSynthesizePacket();
      expect(callCount).toBe(1);

      unsubscribe();

      connection.triggerSynthesizePacket();
      expect(callCount).toBe(1); // Still 1, handler was removed
    });

    it('should support multiple handlers for same packet type', async () => {
      let count1 = 0;
      let count2 = 0;

      connection.registerPacketHandler(0x11, () => {
        count1++;
      });
      connection.registerPacketHandler(0x11, () => {
        count2++;
      });

      connection.triggerSynthesizePacket();

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });
  });

  describe('waitForPacket', () => {
    it('should resolve with packet when received', async () => {
      const packetPromise = connection.waitForPacket(0x11, 1000);

      // Trigger synthesize
      connection.triggerSynthesizePacket();

      const packet = await packetPromise;
      expect(packet).not.toBeNull();
      expect(packet![2]).toBe(0x11);
    });

    it('should return null on timeout', async () => {
      const packet = await connection.waitForPacket(0x99, 50); // Unknown type, short timeout
      expect(packet).toBeNull();
    });
  });

  describe('Automatic Response Simulation', () => {
    it('should respond to GET_MACHINE with MACHINE packet', async () => {
      let receivedPacket: number[] | null = null;

      connection.registerPacketHandler(0x15, (packet) => {
        receivedPacket = packet;
      });

      await connection.sendPacket(createGetMachinePacket());

      expect(receivedPacket).not.toBeNull();
      expect(receivedPacket![2]).toBe(0x15);
    });

    it('should respond to HEARTBEAT with SYNTHESIZE packet', async () => {
      let receivedPacket: number[] | null = null;

      connection.registerPacketHandler(0x11, (packet) => {
        receivedPacket = packet;
      });

      await connection.sendPacket(createHeartbeatPacket());

      expect(receivedPacket).not.toBeNull();
      expect(receivedPacket![2]).toBe(0x11);
    });
  });

  describe('Channel State Updates', () => {
    it('should reflect channel updates in synthesize responses', async () => {
      connection.updateChannel(0, { voltage: 12.0, current: 2.0 });

      let receivedPacket: number[] | null = null;
      connection.registerPacketHandler(0x11, (packet) => {
        receivedPacket = packet;
      });

      connection.triggerSynthesizePacket();

      expect(receivedPacket).not.toBeNull();

      // Verify updated voltage (12V = 12000mV = 0x2EE0)
      const ch0Start = 6;
      expect(receivedPacket![ch0Start + 1]).toBe(0xe0);
      expect(receivedPacket![ch0Start + 2]).toBe(0x2e);
    });

    it('should add new channel configurations', async () => {
      // Initially only channel 0 is configured
      connection.updateChannel(3, { voltage: 3.3, current: 0.5, online: true, isOutput: false, temperature: 30 });

      let receivedPacket: number[] | null = null;
      connection.registerPacketHandler(0x11, (packet) => {
        receivedPacket = packet;
      });

      connection.triggerSynthesizePacket();

      // Verify channel 3 data
      const ch3Start = 6 + 3 * 25;
      expect(receivedPacket![ch3Start]).toBe(3); // Channel number

      // Voltage: 3.3V = 3300mV
      expect(receivedPacket![ch3Start + 1]).toBe(0xe4);
      expect(receivedPacket![ch3Start + 2]).toBe(0x0c);
    });
  });
});

describe('Packet Type Constants', () => {
  it('should have correct values for host->device packets', () => {
    expect(PacketType.SET_ISOUTPUT).toBe(0x16);
    expect(PacketType.GET_ADDR).toBe(0x17);
    expect(PacketType.SET_ADDR).toBe(0x18);
    expect(PacketType.SET_CH).toBe(0x19);
    expect(PacketType.SET_V).toBe(0x1a);
    expect(PacketType.SET_I).toBe(0x1b);
    expect(PacketType.SET_ALL_ADDR).toBe(0x1c);
    expect(PacketType.HEARTBEAT).toBe(0x22);
    expect(PacketType.GET_MACHINE).toBe(0x21);
  });
});
