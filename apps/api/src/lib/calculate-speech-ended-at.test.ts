import { describe, expect, test } from 'bun:test';
import { calculateSpeechEndedAtEpochMilliseconds } from './calculate-speech-ended-at';

const LAST_FRAME_RECEIVED_AT_EPOCH_MILLISECONDS = 1_700_000_010_000;

describe('calculateSpeechEndedAtEpochMilliseconds', () => {
  test('counts back from the latest frame by the audio received after speech ended', () => {
    const speechEndedAt = calculateSpeechEndedAtEpochMilliseconds({
      speechEndAudioMilliseconds: 4380,
      audioReceivedMilliseconds: 5200,
      lastAudioFrameReceivedAtEpochMilliseconds: LAST_FRAME_RECEIVED_AT_EPOCH_MILLISECONDS,
    });

    expect(speechEndedAt).toBe(LAST_FRAME_RECEIVED_AT_EPOCH_MILLISECONDS - 820);
  });

  test('never lands after the latest frame', () => {
    const speechEndedAt = calculateSpeechEndedAtEpochMilliseconds({
      speechEndAudioMilliseconds: 6000,
      audioReceivedMilliseconds: 5200,
      lastAudioFrameReceivedAtEpochMilliseconds: LAST_FRAME_RECEIVED_AT_EPOCH_MILLISECONDS,
    });

    expect(speechEndedAt).toBe(LAST_FRAME_RECEIVED_AT_EPOCH_MILLISECONDS);
  });
});
