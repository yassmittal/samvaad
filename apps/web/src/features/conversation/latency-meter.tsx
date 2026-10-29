'use client';

import { calculateMedian } from './calculate-median';
import type { Caption } from './conversation-reducer';
import { formatSeconds } from './format-seconds';

/** The session's median delay from the end of a sentence until the phone speaks it (D-011). */
export function LatencyMeter({ captions }: { captions: Caption[] }) {
  const latenciesMilliseconds = captions.flatMap((caption) => {
    const latencyMilliseconds = caption.translation?.speechEndToPlaybackStartMilliseconds;
    return latencyMilliseconds == null ? [] : [latencyMilliseconds];
  });
  const medianLatencyMilliseconds = calculateMedian(latenciesMilliseconds);

  if (medianLatencyMilliseconds === null) {
    return null;
  }
  return (
    <p
      className="whitespace-nowrap text-sm text-stone-500"
      title={`Median time from the end of a sentence until the phone starts saying its translation, over ${latenciesMilliseconds.length} sentences`}
    >
      Median delay{' '}
      <span className="font-medium tabular-nums text-stone-900">
        {formatSeconds(medianLatencyMilliseconds)}
      </span>
    </p>
  );
}
