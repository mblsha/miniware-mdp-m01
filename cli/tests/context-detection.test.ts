import { describe, it, expect } from 'vitest';
import type { ChannelUpdate } from '../../webui/src/lib/packet-decoder';
import {
  buildContextsFromChannels,
  selectChannelFromChannels,
  selectMachineTypeFromChannels
} from '../src/context-detection';

const makeChannel = (overrides: Partial<ChannelUpdate>): ChannelUpdate => ({
  channel: 0,
  online: true,
  machineType: 'P906',
  ...overrides
});

describe('context detection helpers', () => {
  it('should build contexts for PSU and Load channels on one port', () => {
    const channels: ChannelUpdate[] = [
      makeChannel({ channel: 0, machineType: 'P906' }),
      makeChannel({ channel: 1, machineType: 'L1060' })
    ];

    const contexts = buildContextsFromChannels('/dev/ttyUSB0', channels);

    expect(contexts).toHaveLength(2);
    expect(contexts).toEqual(
      expect.arrayContaining([
        {
          portPath: '/dev/ttyUSB0',
          category: 'psu',
          machineType: 'P906',
          channel: 0
        },
        {
          portPath: '/dev/ttyUSB0',
          category: 'load',
          machineType: 'L1060',
          channel: 1
        }
      ])
    );
  });

  it('should ignore Unknown/Node channels when building contexts', () => {
    const channels: ChannelUpdate[] = [
      makeChannel({ channel: 0, machineType: 'Unknown' }),
      makeChannel({ channel: 1, machineType: 'Node' })
    ];

    const contexts = buildContextsFromChannels('/dev/ttyUSB0', channels);

    expect(contexts).toHaveLength(0);
  });

  it('should ignore offline channels when building contexts', () => {
    const channels: ChannelUpdate[] = [
      makeChannel({ channel: 0, machineType: 'P906', online: false }),
      makeChannel({ channel: 1, machineType: 'L1060', online: false })
    ];

    const contexts = buildContextsFromChannels('/dev/ttyUSB0', channels);

    expect(contexts).toHaveLength(0);
  });

  it('should select the correct channel for load vs psu', () => {
    const channels: ChannelUpdate[] = [
      makeChannel({ channel: 1, machineType: 'L1060' }),
      makeChannel({ channel: 0, machineType: 'P906' })
    ];

    expect(selectChannelFromChannels(channels, 'load')?.channel).toBe(1);
    expect(selectChannelFromChannels(channels, 'psu')?.channel).toBe(0);
  });

  it('should return null when no real machine types are present', () => {
    const channels: ChannelUpdate[] = [
      makeChannel({ channel: 0, machineType: 'Unknown' }),
      makeChannel({ channel: 1, machineType: 'Node' })
    ];

    expect(selectMachineTypeFromChannels(channels)).toBeNull();
  });
});
