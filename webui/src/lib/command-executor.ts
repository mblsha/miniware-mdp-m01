import {
  createSetChannelPacket,
  createSetCurrentPacket,
  createSetOutputPacket,
  createSetVoltagePacket,
} from './packet-encoder';

export type CommandTransport = {
  sendPacket: (packet: number[] | Uint8Array) => Promise<void>;
};

export type SetpointEditMode = 'voltage' | 'current';

/**
 * Apply the voltage/current pair carried by both SET_V and SET_I.
 *
 * Reverse engineering of M01 v2.02 shows that the two commands update both
 * setpoints; only the controller's edit/control mode differs. SET_CH is not a
 * prerequisite because the command header directly indexes the target slot.
 * The firmware sends no command ACK, so callers that need confirmation must
 * compare a later SYNTHESIZE telemetry frame with the requested state.
 */
export async function executeSetpointCommand(
  transport: CommandTransport,
  channel: number,
  voltage: number,
  current: number,
  mode: SetpointEditMode
): Promise<void> {
  const packet = mode === 'voltage'
    ? createSetVoltagePacket(channel, voltage, current)
    : createSetCurrentPacket(channel, voltage, current);
  await transport.sendPacket(packet);
}

/** Apply output state without changing the M01's selected UI/wave channel. */
export async function executeOutputCommand(
  transport: CommandTransport,
  channel: number,
  enabled: boolean
): Promise<void> {
  await transport.sendPacket(createSetOutputPacket(channel, enabled));
}

/**
 * Select the controller UI/wave channel. This also clears the firmware's
 * partially accumulated WAVE group, so control commands must not call it as a
 * generic addressing step.
 */
export async function executeSelectChannelCommand(
  transport: CommandTransport,
  channel: number
): Promise<void> {
  await transport.sendPacket(createSetChannelPacket(channel));
}
