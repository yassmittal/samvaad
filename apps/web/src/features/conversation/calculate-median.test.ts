import { describe, expect, test } from 'bun:test';
import { calculateMedian } from './calculate-median';

describe('calculateMedian', () => {
  test('the middle value of an odd count', () => {
    expect(calculateMedian([2400, 900, 1500])).toBe(1500);
  });

  test('the mean of the two middle values of an even count', () => {
    expect(calculateMedian([1000, 4000, 2000, 3000])).toBe(2500);
  });

  test('null for no values', () => {
    expect(calculateMedian([])).toBeNull();
  });
});
