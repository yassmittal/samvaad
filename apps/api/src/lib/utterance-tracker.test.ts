import { describe, expect, test } from 'bun:test';
import { createUtteranceTracker } from './utterance-tracker';

function createTrackerWithCountingIds() {
  let createdUtteranceCount = 0;
  return createUtteranceTracker({
    createUtteranceId: () => `utterance-${++createdUtteranceCount}`,
  });
}

describe('createUtteranceTracker', () => {
  test('partials belong to the most recent speechStart', () => {
    const tracker = createTrackerWithCountingIds();

    tracker.startUtterance(0);
    expect(tracker.findCurrentUtterance().utteranceId).toBe('utterance-1');
    tracker.startUtterance(1);
    expect(tracker.findCurrentUtterance().utteranceId).toBe('utterance-2');
  });

  test('a final for an earlier turn finds that turn, not the current one', () => {
    const tracker = createTrackerWithCountingIds();

    tracker.startUtterance(0);
    tracker.startUtterance(1);

    expect(tracker.finishUtterance(0).utteranceId).toBe('utterance-1');
    expect(tracker.findCurrentUtterance().utteranceId).toBe('utterance-2');
  });

  test('keeps the speech end time for the final transcript', () => {
    const tracker = createTrackerWithCountingIds();

    tracker.startUtterance(0);
    tracker.markSpeechEnded(0, 1_700_000_000_000);

    expect(tracker.finishUtterance(0).speechEndedAtEpochMilliseconds).toBe(1_700_000_000_000);
  });

  test('partials before any speechStart join the turn that starts next', () => {
    const tracker = createTrackerWithCountingIds();

    const earlyUtterance = tracker.findCurrentUtterance();
    tracker.startUtterance(0);

    expect(tracker.findCurrentUtterance().utteranceId).toBe(earlyUtterance.utteranceId);
  });
});
