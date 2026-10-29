import { describe, expect, test } from 'bun:test';
import { ROOM_CODE_ALPHABET, roomCodeSchema } from '@samvaad/shared';
import { generateRoomCode } from './generate-room-code';

describe('generateRoomCode', () => {
  test('makes 6 characters from the alphabet, which the shared schema accepts', () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const roomCode = generateRoomCode();
      expect(roomCodeSchema.parse(roomCode)).toBe(roomCode);
    }
  });

  test('uses the picked characters, first to last', () => {
    const pickedIndexes = [0, 1, 2, 3, 4, ROOM_CODE_ALPHABET.length - 1];
    expect(generateRoomCode(() => pickedIndexes.shift() ?? 0)).toBe('ABCDE9');
  });
});
