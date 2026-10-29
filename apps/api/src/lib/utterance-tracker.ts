export type TrackedUtterance = {
  utteranceId: string;
  speechEndedAtEpochMilliseconds: number | null;
};

// Partials that arrive before any `speechStart` are kept under this turn until one arrives.
const UNKNOWN_TURN_ID = -1;

/**
 * Maps Meta's turns to our utterances for one transcription stream. Meta says to correlate
 * by `turnId`, not arrival order: `speechComplete` can arrive after the next `speechStart`.
 * Partials carry no `turnId`; they belong to the most recent `speechStart` (D-005).
 */
export function createUtteranceTracker({ createUtteranceId }: { createUtteranceId: () => string }) {
  const utterancesByTurnId = new Map<number, TrackedUtterance>();
  let currentTurnId = UNKNOWN_TURN_ID;

  function findOrCreateUtterance(turnId: number): TrackedUtterance {
    const existingUtterance =
      utterancesByTurnId.get(turnId) ?? utterancesByTurnId.get(UNKNOWN_TURN_ID);
    if (existingUtterance) {
      utterancesByTurnId.delete(UNKNOWN_TURN_ID);
      utterancesByTurnId.set(turnId, existingUtterance);
      return existingUtterance;
    }
    const utterance: TrackedUtterance = {
      utteranceId: createUtteranceId(),
      speechEndedAtEpochMilliseconds: null,
    };
    utterancesByTurnId.set(turnId, utterance);
    return utterance;
  }

  return {
    startUtterance(turnId: number): TrackedUtterance {
      currentTurnId = turnId;
      return findOrCreateUtterance(turnId);
    },

    findCurrentUtterance(): TrackedUtterance {
      return findOrCreateUtterance(currentTurnId);
    },

    markSpeechEnded(turnId: number, speechEndedAtEpochMilliseconds: number): void {
      findOrCreateUtterance(turnId).speechEndedAtEpochMilliseconds = speechEndedAtEpochMilliseconds;
    },

    /** Removes the utterance for `turnId` and returns it, for its final transcript. */
    finishUtterance(turnId: number): TrackedUtterance {
      const utterance = findOrCreateUtterance(turnId);
      utterancesByTurnId.delete(turnId);
      return utterance;
    },
  };
}

export type UtteranceTracker = ReturnType<typeof createUtteranceTracker>;
