// The first chunk starts a little after it is scheduled, so the next one has time to arrive.
export const FIRST_CHUNK_LEAD_SECONDS = 0.1;
// After a gap (the network fell behind), restart just ahead of now instead of in the past.
export const RESUME_LEAD_SECONDS = 0.05;

/**
 * When the next chunk of a spoken translation should start: straight after the previous one,
 * so the chunks play as one sound, unless that moment has already passed (D-021).
 */
export function planChunkStartTimeSeconds({
  currentTimeSeconds,
  previousChunkEndTimeSeconds,
}: {
  currentTimeSeconds: number;
  /** `null` for the first chunk. */
  previousChunkEndTimeSeconds: number | null;
}): number {
  if (previousChunkEndTimeSeconds === null) {
    return currentTimeSeconds + FIRST_CHUNK_LEAD_SECONDS;
  }
  return Math.max(previousChunkEndTimeSeconds, currentTimeSeconds + RESUME_LEAD_SECONDS);
}
