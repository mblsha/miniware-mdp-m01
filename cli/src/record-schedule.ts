export function parseOutputOnAfterSeconds(
  value: string | undefined,
  durationSeconds: number | null,
  replayPerfettoPath: string | undefined
): number | null {
  if (value === undefined) {
    return null;
  }
  const delaySeconds = Number(value);
  if (!Number.isFinite(delaySeconds) || delaySeconds <= 0) {
    throw new Error('Output-on delay must be a positive number of seconds');
  }
  if (replayPerfettoPath) {
    throw new Error('--output-on-after is unavailable during Perfetto replay');
  }
  if (durationSeconds === null) {
    throw new Error('--output-on-after requires a finite --duration');
  }
  if (delaySeconds >= durationSeconds) {
    throw new Error(
      '--output-on-after must occur before the recording duration ends'
    );
  }
  return delaySeconds;
}
