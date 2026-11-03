import { describe, expect, test } from 'bun:test';
import { isQuietAudioFrame } from './is-quiet-audio-frame';

function createFrame(amplitude: number, sampleCount = 1280): Uint8Array {
  const samples = new Int16Array(sampleCount);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    // A square wave: its root mean square is its amplitude.
    samples[sampleIndex] = sampleIndex % 2 === 0 ? amplitude : -amplitude;
  }
  return new Uint8Array(samples.buffer);
}

describe('isQuietAudioFrame (D-024)', () => {
  test('silence is quiet', () => {
    expect(isQuietAudioFrame(new Uint8Array(2560))).toBe(true);
  });

  test('faint room tone is quiet; speech is not', () => {
    expect(isQuietAudioFrame(createFrame(100))).toBe(true);
    expect(isQuietAudioFrame(createFrame(3000))).toBe(false);
  });

  test('reads a frame that starts at an odd byte offset', () => {
    const loudFrame = createFrame(3000, 4);
    const bytes = new Uint8Array(loudFrame.byteLength + 1);
    bytes.set(loudFrame, 1);
    expect(isQuietAudioFrame(bytes.subarray(1))).toBe(false);
  });

  test('an empty frame is quiet', () => {
    expect(isQuietAudioFrame(new Uint8Array(0))).toBe(true);
  });
});
