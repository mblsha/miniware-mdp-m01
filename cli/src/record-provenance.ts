export type MeasurementStats = {
  samples: number;
  voltage_v: {
    min: number | null;
    max: number | null;
    mean: number | null;
  };
  current_a: {
    min: number | null;
    max: number | null;
    mean: number | null;
  };
  power_w: {
    min: number | null;
    max: number | null;
    mean: number | null;
  };
};

export type MeasurementAccumulator = {
  samples: number;
  voltageMin: number;
  voltageMax: number;
  voltageSum: number;
  currentMin: number;
  currentMax: number;
  currentSum: number;
  powerMin: number;
  powerMax: number;
  powerSum: number;
};

export function createMeasurementAccumulator(): MeasurementAccumulator {
  return {
    samples: 0,
    voltageMin: Number.POSITIVE_INFINITY,
    voltageMax: Number.NEGATIVE_INFINITY,
    voltageSum: 0,
    currentMin: Number.POSITIVE_INFINITY,
    currentMax: Number.NEGATIVE_INFINITY,
    currentSum: 0,
    powerMin: Number.POSITIVE_INFINITY,
    powerMax: Number.NEGATIVE_INFINITY,
    powerSum: 0
  };
}

export function addMeasurement(
  accumulator: MeasurementAccumulator,
  voltage: number,
  current: number
): void {
  const power = voltage * current;
  accumulator.samples += 1;
  accumulator.voltageMin = Math.min(accumulator.voltageMin, voltage);
  accumulator.voltageMax = Math.max(accumulator.voltageMax, voltage);
  accumulator.voltageSum += voltage;
  accumulator.currentMin = Math.min(accumulator.currentMin, current);
  accumulator.currentMax = Math.max(accumulator.currentMax, current);
  accumulator.currentSum += current;
  accumulator.powerMin = Math.min(accumulator.powerMin, power);
  accumulator.powerMax = Math.max(accumulator.powerMax, power);
  accumulator.powerSum += power;
}

export function finishMeasurements(
  accumulator: MeasurementAccumulator
): MeasurementStats {
  const count = accumulator.samples;
  const range = (
    min: number,
    max: number,
    sum: number
  ): { min: number | null; max: number | null; mean: number | null } => ({
    min: count ? min : null,
    max: count ? max : null,
    mean: count ? sum / count : null
  });
  return {
    samples: count,
    voltage_v: range(
      accumulator.voltageMin,
      accumulator.voltageMax,
      accumulator.voltageSum
    ),
    current_a: range(
      accumulator.currentMin,
      accumulator.currentMax,
      accumulator.currentSum
    ),
    power_w: range(
      accumulator.powerMin,
      accumulator.powerMax,
      accumulator.powerSum
    )
  };
}

export function parseMetadataPath(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (value.trim().length === 0) {
    throw new Error('Record metadata path must not be empty');
  }
  return value;
}
