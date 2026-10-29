const MILLISECONDS_PER_SECOND = 1000;

/** 940 → "0.9 s". */
export function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / MILLISECONDS_PER_SECOND).toFixed(1)} s`;
}
