import { describe, expect, test } from 'bun:test';
import { countSilencePaddingFrames } from './count-silence-padding-frames';

const FRAME_DURATION_MILLISECONDS = 80;
const MAXIMUM_AUDIO_LAG_MILLISECONDS = 400;

function countFrames(elapsedMilliseconds: number, audioSentMilliseconds: number): number {
  return countSilencePaddingFrames({
    elapsedMilliseconds,
    audioSentMilliseconds,
    maximumAudioLagMilliseconds: MAXIMUM_AUDIO_LAG_MILLISECONDS,
    frameDurationMilliseconds: FRAME_DURATION_MILLISECONDS,
  });
}

describe('countSilencePaddingFrames (D-024)', () => {
  test('audio on time, or ahead, needs no silence', () => {
    expect(countFrames(5000, 5000)).toBe(0);
    expect(countFrames(5000, 9000)).toBe(0);
  });

  test('a lag within the allowance needs no silence', () => {
    expect(countFrames(5000, 4600)).toBe(0);
  });

  test('just past the allowance needs one frame', () => {
    expect(countFrames(5000, 4599)).toBe(1);
  });

  test('a long stall is made up to within the allowance', () => {
    // 2 s behind: 1.6 s past the allowance is 20 frames.
    expect(countFrames(12_000, 10_000)).toBe(20);
  });
});
