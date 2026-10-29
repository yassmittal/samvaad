import { describe, expect, test } from 'bun:test';
import { createTableRoom } from './room';
import { createRoomRegistry } from './room-registry';

type TestParticipant = { participantId: string };

const creator: TestParticipant = { participantId: 'creator' };
const guest: TestParticipant = { participantId: 'guest' };
const latecomer: TestParticipant = { participantId: 'latecomer' };

describe('createRoomRegistry', () => {
  test('creates a room with its creator in it, findable by code', () => {
    const registry = createRoomRegistry<TestParticipant>();

    const room = registry.createRoom(creator);

    expect(room.roomCode).toHaveLength(6);
    expect([...room.participants.keys()]).toEqual(['creator']);
    expect(registry.findRoom(room.roomCode)).toBe(room);
  });

  test('never hands out a code that is already open', () => {
    const roomCodes = ['AAAAAA', 'AAAAAA', 'BBBBBB'];
    const registry = createRoomRegistry<TestParticipant>({
      createRoomCode: () => roomCodes.shift() ?? 'CCCCCC',
    });

    const firstRoom = registry.createRoom(creator);
    const secondRoom = registry.createRoom(guest);

    expect([firstRoom.roomCode, secondRoom.roomCode]).toEqual(['AAAAAA', 'BBBBBB']);
  });

  test('joins an open room until it is full', () => {
    const registry = createRoomRegistry<TestParticipant>();
    const room = registry.createRoom(creator);
    const roomCode = room.roomCode;

    expect(registry.joinRoom(roomCode, guest)).toEqual({ isJoined: true, room });
    expect(registry.joinRoom(roomCode, latecomer)).toEqual({
      isJoined: false,
      errorCode: 'ROOM_FULL',
    });
    expect(room.participants.size).toBe(2);
  });

  test('works for more than two when allowed', () => {
    const registry = createRoomRegistry<TestParticipant>({ maximumParticipantsPerRoom: 3 });
    const room = registry.createRoom(creator);

    registry.joinRoom(room.roomCode, guest);

    expect(registry.joinRoom(room.roomCode, latecomer).isJoined).toBe(true);
  });

  test('a missing code is ROOM_NOT_FOUND', () => {
    const registry = createRoomRegistry<TestParticipant>();

    expect(registry.joinRoom('ZZZZZZ', guest)).toEqual({
      isJoined: false,
      errorCode: 'ROOM_NOT_FOUND',
    });
  });

  test('a room closes when the last participant leaves, not before', () => {
    const registry = createRoomRegistry<TestParticipant>();
    const room = registry.createRoom(creator);
    const roomCode = room.roomCode;
    registry.joinRoom(roomCode, guest);

    registry.leaveRoom(room, 'creator');
    expect(registry.findRoom(roomCode)).toBe(room);

    registry.leaveRoom(room, 'guest');
    expect(registry.findRoom(roomCode)).toBeNull();
    expect(registry.joinRoom(roomCode, latecomer).isJoined).toBe(false);
  });

  test('a table room has no code, and leaving it empties it', () => {
    const registry = createRoomRegistry<TestParticipant>();
    const tableRoom = createTableRoom(creator);

    registry.leaveRoom(tableRoom, 'creator');

    expect(tableRoom.roomCode).toBeNull();
    expect(tableRoom.participants.size).toBe(0);
  });
});
