import { describe, expect, test } from 'bun:test';
import {
  FIRST_CHUNK_LEAD_SECONDS,
  planChunkStartTimeSeconds,
  RESUME_LEAD_SECONDS,
} from './plan-chunk-start-time';

describe('planChunkStartTimeSeconds', () => {
  test('the first chunk starts a little after now', () => {
    expect(
      planChunkStartTimeSeconds({ currentTimeSeconds: 10, previousChunkEndTimeSeconds: null }),
    ).toBe(10 + FIRST_CHUNK_LEAD_SECONDS);
  });

  test('a chunk that arrives in time starts exactly where the previous one ends', () => {
    expect(
      planChunkStartTimeSeconds({ currentTimeSeconds: 10, previousChunkEndTimeSeconds: 10.4 }),
    ).toBe(10.4);
  });

  test('a chunk that arrives late starts just ahead of now', () => {
    expect(
      planChunkStartTimeSeconds({ currentTimeSeconds: 11, previousChunkEndTimeSeconds: 10.4 }),
    ).toBe(11 + RESUME_LEAD_SECONDS);
  });
});
