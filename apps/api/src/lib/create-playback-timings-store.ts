import type { UtteranceTimings } from '@samvaad/shared';

// A translation in a language the phone has no voice for is never played, so its timings are
// never taken. Keep only the most recent ones.
export const MAXIMUM_UTTERANCES_AWAITING_PLAYBACK = 50;

/** Each translated utterance's timings, held until the listener's phone starts speaking it. */
export function createPlaybackTimingsStore({
  maximumUtteranceCount = MAXIMUM_UTTERANCES_AWAITING_PLAYBACK,
}: {
  maximumUtteranceCount?: number;
} = {}) {
  const timingsByUtteranceId = new Map<string, UtteranceTimings>();

  return {
    remember(utteranceId: string, timings: UtteranceTimings): void {
      timingsByUtteranceId.set(utteranceId, timings);
      // A Map iterates in insertion order, so the first key is the oldest.
      for (const oldestUtteranceId of timingsByUtteranceId.keys()) {
        if (timingsByUtteranceId.size <= maximumUtteranceCount) {
          break;
        }
        timingsByUtteranceId.delete(oldestUtteranceId);
      }
    },

    /** Returns the timings once; a second playback of the same utterance finds `null`. */
    take(utteranceId: string): UtteranceTimings | null {
      const timings = timingsByUtteranceId.get(utteranceId) ?? null;
      timingsByUtteranceId.delete(utteranceId);
      return timings;
    },
  };
}

export type PlaybackTimingsStore = ReturnType<typeof createPlaybackTimingsStore>;
