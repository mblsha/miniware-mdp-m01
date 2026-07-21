export type DeviceLimits = {
  maxVoltage: number;
  maxCurrent: number;
  maxPower: number;
};

export function getDeviceLimits(machineType: string): DeviceLimits | null {
  const normalized = machineType.trim().toUpperCase();
  if (normalized.includes('P905')) {
    return { maxVoltage: 30, maxCurrent: 5, maxPower: 30 * 5 };
  }
  if (normalized.includes('P906')) {
    return { maxVoltage: 30, maxCurrent: 10, maxPower: 30 * 10 };
  }
  if (normalized.includes('L1060')) {
    return { maxVoltage: 60, maxCurrent: 10, maxPower: 60 * 10 };
  }
  return null;
}

export function validateDeviceTargets(machineType: string, voltage: number, current: number): DeviceLimits {
  const limits = getDeviceLimits(machineType);
  if (!limits) {
    throw new Error(`Unknown device type "${machineType}"; refusing to send unbounded setpoints`);
  }
  if (!Number.isFinite(voltage) || voltage < 0 || voltage > limits.maxVoltage) {
    throw new RangeError(`Voltage must be between 0 and ${limits.maxVoltage} V for ${machineType}`);
  }
  if (!Number.isFinite(current) || current < 0 || current > limits.maxCurrent) {
    throw new RangeError(`Current must be between 0 and ${limits.maxCurrent} A for ${machineType}`);
  }
  if (voltage * current > limits.maxPower) {
    throw new RangeError(`Requested power exceeds the ${limits.maxPower} W limit for ${machineType}`);
  }
  return limits;
}
