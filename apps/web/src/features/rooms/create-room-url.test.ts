import { describe, expect, test } from 'bun:test';
import { createRoomUrl } from './create-room-url';

describe('createRoomUrl', () => {
  test('puts the code under /room on this site', () => {
    expect(createRoomUrl({ origin: 'https://abc.trycloudflare.com', roomCode: 'K7MQ2X' })).toBe(
      'https://abc.trycloudflare.com/room/K7MQ2X',
    );
  });
});
