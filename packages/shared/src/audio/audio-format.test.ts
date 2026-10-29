import { describe, expect, test } from 'bun:test';
import { BYTES_PER_FRAME, SAMPLES_PER_FRAME } from './audio-format';

describe('audio format', () => {
  test('an 80 ms frame at 16 kHz is 1280 samples and 2560 bytes', () => {
    expect(SAMPLES_PER_FRAME).toBe(1280);
    expect(BYTES_PER_FRAME).toBe(2560);
  });
});
