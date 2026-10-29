import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@samvaad/shared';

/**
 * A random room code with no look-alike characters, such as `K7MQ2X`. `pickIndex` returns
 * an integer from 0 up to, not including, its argument; tests pass their own.
 */
export function generateRoomCode(
  pickIndex: (exclusiveMaximum: number) => number = randomInt,
): string {
  let roomCode = '';
  for (let characterIndex = 0; characterIndex < ROOM_CODE_LENGTH; characterIndex += 1) {
    roomCode += ROOM_CODE_ALPHABET[pickIndex(ROOM_CODE_ALPHABET.length)];
  }
  return roomCode;
}
