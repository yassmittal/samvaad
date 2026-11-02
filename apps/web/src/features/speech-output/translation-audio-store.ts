// Spoken translations kept for the repeat button; older ones are dropped (about 48 KB a second).
export const MAXIMUM_STORED_TRANSLATION_AUDIO_COUNT = 30;

export type TranslationAudio = {
  /** PCM16 samples as they arrived, at `TRANSLATION_AUDIO_SAMPLE_RATE_HERTZ`. */
  chunks: Int16Array[];
  /** `translation_audio_end` has arrived: no more chunks. */
  isEnded: boolean;
  /** The API couldn't make the speech; the phone speaks the text itself (D-021). */
  hasFailed: boolean;
};

/**
 * The audio of each spoken translation, by utterance id, as its frames arrive from the API
 * (D-021). A player subscribes to an utterance and is told whenever it grows or ends.
 */
export function createTranslationAudioStore({
  maximumStoredCount = MAXIMUM_STORED_TRANSLATION_AUDIO_COUNT,
}: {
  maximumStoredCount?: number;
} = {}) {
  const audiosByUtteranceId = new Map<string, TranslationAudio>();
  const listenersByUtteranceId = new Map<string, Set<() => void>>();

  function findOrCreateAudio(utteranceId: string): TranslationAudio {
    const existingAudio = audiosByUtteranceId.get(utteranceId);
    if (existingAudio) {
      return existingAudio;
    }
    const audio: TranslationAudio = { chunks: [], isEnded: false, hasFailed: false };
    audiosByUtteranceId.set(utteranceId, audio);
    // A Map keeps insertion order, so the first key is the oldest translation.
    while (audiosByUtteranceId.size > maximumStoredCount) {
      const oldestUtteranceId = audiosByUtteranceId.keys().next().value;
      if (oldestUtteranceId === undefined) {
        break;
      }
      audiosByUtteranceId.delete(oldestUtteranceId);
    }
    return audio;
  }

  function notifyListeners(utteranceId: string): void {
    for (const listener of listenersByUtteranceId.get(utteranceId) ?? []) {
      listener();
    }
  }

  return {
    appendChunk(utteranceId: string, samples: Int16Array): void {
      const audio = findOrCreateAudio(utteranceId);
      if (audio.isEnded) {
        return;
      }
      audio.chunks.push(samples);
      notifyListeners(utteranceId);
    },

    end(utteranceId: string, hasFailed: boolean): void {
      const audio = findOrCreateAudio(utteranceId);
      audio.isEnded = true;
      audio.hasFailed = hasFailed;
      notifyListeners(utteranceId);
    },

    find(utteranceId: string): TranslationAudio | null {
      return audiosByUtteranceId.get(utteranceId) ?? null;
    },

    /** Returns the unsubscribe function. */
    subscribe(utteranceId: string, listener: () => void): () => void {
      const listeners = listenersByUtteranceId.get(utteranceId) ?? new Set();
      listeners.add(listener);
      listenersByUtteranceId.set(utteranceId, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          listenersByUtteranceId.delete(utteranceId);
        }
      };
    },
  };
}

export type TranslationAudioStore = ReturnType<typeof createTranslationAudioStore>;
