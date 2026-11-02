import { calculateMedian } from '../conversation/calculate-median';
import type { Caption } from '../conversation/conversation-reducer';
import { formatSeconds } from '../conversation/format-seconds';

/** The call's median delay, end of a sentence to its translation starting here (D-011). */
export function CallLatencyChip({ captions }: { captions: readonly Caption[] }) {
  const latenciesMilliseconds = captions.flatMap((caption) => {
    const latencyMilliseconds = caption.translation?.speechEndToPlaybackStartMilliseconds;
    return latencyMilliseconds == null ? [] : [latencyMilliseconds];
  });
  const medianLatencyMilliseconds = calculateMedian(latenciesMilliseconds);
  if (medianLatencyMilliseconds === null) {
    return null;
  }
  return (
    <span
      title={`Median time from the end of a sentence until this phone starts saying its translation, over ${latenciesMilliseconds.length} sentences`}
      className="rounded-full bg-white/10 px-2.5 py-1 text-xs tabular-nums text-call-muted"
    >
      {formatSeconds(medianLatencyMilliseconds)} delay
    </span>
  );
}
