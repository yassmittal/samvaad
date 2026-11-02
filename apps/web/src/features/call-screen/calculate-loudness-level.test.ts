import { describe, expect, test } from 'bun:test';
import { calculateLoudnessLevel, smoothLoudnessLevel } from './calculate-loudness-level';

describe('calculateLoudnessLevel', () => {
  test('silence is 0, and nothing is louder than 1', () => {
    expect(calculateLoudnessLevel(new Float32Array(128))).toBe(0);
    expect(calculateLoudnessLevel(new Float32Array(128).fill(1))).toBe(1);
    expect(calculateLoudnessLevel(new Float32Array())).toBe(0);
  });

  test('a speaking voice lands in the middle of the range', () => {
    const speechLevel = calculateLoudnessLevel(new Float32Array(128).fill(0.1));

    expect(speechLevel).toBeGreaterThan(0.4);
    expect(speechLevel).toBeLessThan(1);
  });
});

describe('smoothLoudnessLevel', () => {
  test('rises faster than it falls', () => {
    const rise = smoothLoudnessLevel(0, 1);
    const fall = 1 - smoothLoudnessLevel(1, 0);

    expect(rise).toBeGreaterThan(fall);
  });
});
