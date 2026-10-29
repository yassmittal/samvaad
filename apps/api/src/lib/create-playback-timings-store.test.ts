import { describe, expect, test } from 'bun:test';
import type { UtteranceTimings } from '@samvaad/shared';
import { createPlaybackTimingsStore } from './create-playback-timings-store';

function createTimings(speechEndedAtEpochMilliseconds: number): UtteranceTimings {
  return {
    speechEndedAtEpochMilliseconds,
    transcriptFinalAtEpochMilliseconds: speechEndedAtEpochMilliseconds + 800,
    firstTranslationDeltaAtEpochMilliseconds: speechEndedAtEpochMilliseconds + 2000,
    translationCompleteAtEpochMilliseconds: speechEndedAtEpochMilliseconds + 2100,
  };
}

describe('createPlaybackTimingsStore', () => {
  test('hands back an utterance’s timings once', () => {
    const store = createPlaybackTimingsStore();
    store.remember('utterance-1', createTimings(1000));

    expect(store.take('utterance-1')).toEqual(createTimings(1000));
    expect(store.take('utterance-1')).toBeNull();
  });

  test('returns null for an utterance it never saw', () => {
    expect(createPlaybackTimingsStore().take('unknown')).toBeNull();
  });

  test('forgets the oldest utterances beyond its limit', () => {
    const store = createPlaybackTimingsStore({ maximumUtteranceCount: 2 });
    store.remember('utterance-1', createTimings(1000));
    store.remember('utterance-2', createTimings(2000));
    store.remember('utterance-3', createTimings(3000));

    expect(store.take('utterance-1')).toBeNull();
    expect(store.take('utterance-2')).not.toBeNull();
    expect(store.take('utterance-3')).not.toBeNull();
  });
});
