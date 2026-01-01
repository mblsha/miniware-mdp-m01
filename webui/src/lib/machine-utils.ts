export function getMachineTypeString(type: number): string {
  const types: Record<number, string> = {
    0: 'Node',
    1: 'P905',
    2: 'P906',
    3: 'L1060',
    16: 'M01 with LCD',
    17: 'M02 without LCD'
  };
  return types[type] || `Unknown (${type})`;
}
