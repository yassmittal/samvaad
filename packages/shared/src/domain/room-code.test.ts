import { describe, expect, test } from 'bun:test';
import { ROOM_CODE_ALPHABET, roomCodeSchema } from './room-code';

describe('roomCodeSchema', () => {
  test('normalises a typed code to upper case without spaces', () => {
    expect(roomCodeSchema.parse(' abc234 ')).toBe('ABC234');
  });

  test('rejects a code of the wrong length', () => {
    expect(roomCodeSchema.safeParse('ABC23').success).toBe(false);
    expect(roomCodeSchema.safeParse('ABC2345').success).toBe(false);
  });

  test('rejects look-alike characters, which no code contains', () => {
    for (const lookAlike of ['0', 'O', '1', 'I', 'L']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(lookAlike);
      expect(roomCodeSchema.safeParse(`ABC23${lookAlike}`).success).toBe(false);
    }
  });
});
