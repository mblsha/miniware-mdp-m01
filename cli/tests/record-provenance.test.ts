import { describe, expect, it } from 'vitest';
import {
  addMeasurement,
  createMeasurementAccumulator,
  finishMeasurements,
  parseMetadataPath
} from '../src/record-provenance';

describe('record provenance', () => {
  it('summarizes voltage, current, and correlated power samples', () => {
    const accumulator = createMeasurementAccumulator();
    addMeasurement(accumulator, 4, 0.01);
    addMeasurement(accumulator, 4.2, 0.02);

    expect(finishMeasurements(accumulator)).toEqual({
      samples: 2,
      voltage_v: { min: 4, max: 4.2, mean: 4.1 },
      current_a: { min: 0.01, max: 0.02, mean: 0.015 },
      power_w: {
        min: 0.04,
        max: 0.084,
        mean: 0.062
      }
    });
  });

  it('reports null ranges when no wave sample arrived', () => {
    expect(finishMeasurements(createMeasurementAccumulator())).toEqual({
      samples: 0,
      voltage_v: { min: null, max: null, mean: null },
      current_a: { min: null, max: null, mean: null },
      power_w: { min: null, max: null, mean: null }
    });
  });

  it('accepts an absent path and rejects an empty path', () => {
    expect(parseMetadataPath(undefined)).toBeNull();
    expect(parseMetadataPath('/tmp/capture.json')).toBe('/tmp/capture.json');
    expect(() => parseMetadataPath('  ')).toThrow('must not be empty');
  });
});
