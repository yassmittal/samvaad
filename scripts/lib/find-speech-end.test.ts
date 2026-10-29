import { describe, expect, test } from 'bun:test';
import { findSpeechEndMilliseconds } from './find-speech-end';

const SAMPLE_RATE_HERTZ = 16_000;
const SAMPLES_PER_MILLISECOND = SAMPLE_RATE_HERTZ / 1000;
const LOUD_SAMPLE_VALUE = 10_000;

function createPcmBytes(segments: { durationMilliseconds: number; isLoud: boolean }[]): Uint8Array {
  const totalSampleCount = segments.reduce(
    (total, segment) => total + segment.durationMilliseconds * SAMPLES_PER_MILLISECOND,
    0,
  );
  const samples = new Int16Array(totalSampleCount);
  let sampleIndex = 0;
  for (const segment of segments) {
    const segmentSampleCount = segment.durationMilliseconds * SAMPLES_PER_MILLISECOND;
    for (let offset = 0; offset < segmentSampleCount; offset++) {
      // A square wave: loud enough to count as speech, simple to reason about.
      samples[sampleIndex++] = segment.isLoud ? (offset % 2 === 0 ? 1 : -1) * LOUD_SAMPLE_VALUE : 0;
    }
  }
  return new Uint8Array(samples.buffer);
}

describe('findSpeechEndMilliseconds', () => {
  test('finds the end of the last loud stretch', () => {
    const pcmBytes = createPcmBytes([
      { durationMilliseconds: 200, isLoud: false },
      { durationMilliseconds: 500, isLoud: true },
      { durationMilliseconds: 300, isLoud: false },
      { durationMilliseconds: 400, isLoud: true },
      { durationMilliseconds: 600, isLoud: false },
    ]);

    expect(findSpeechEndMilliseconds(pcmBytes, SAMPLE_RATE_HERTZ)).toBe(1400);
  });

  test('returns null for silence', () => {
    const pcmBytes = createPcmBytes([{ durationMilliseconds: 1000, isLoud: false }]);

    expect(findSpeechEndMilliseconds(pcmBytes, SAMPLE_RATE_HERTZ)).toBeNull();
  });
});
