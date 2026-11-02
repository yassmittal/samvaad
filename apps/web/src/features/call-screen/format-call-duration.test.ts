import { describe, expect, test } from 'bun:test';
import { formatCallDuration } from './format-call-duration';

describe('formatCallDuration', () => {
  test('formats like a phone call screen', () => {
    expect(formatCallDuration(0)).toBe('0:00');
    expect(formatCallDuration(7_900)).toBe('0:07');
    expect(formatCallDuration(754_000)).toBe('12:34');
    expect(formatCallDuration(3_723_000)).toBe('1:02:03');
  });

  test('never shows a negative time, even if clocks disagree', () => {
    expect(formatCallDuration(-5_000)).toBe('0:00');
  });
});
