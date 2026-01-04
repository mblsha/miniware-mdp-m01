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
