import { generateRoomCode } from '../lib/generate-room-code';
import { createEmptyRoom, type Room } from './room';

// The MVP's UI is for two people; nothing else in the API assumes it.
export const MAX_PARTICIPANTS_PER_ROOM = 2;

type RoomRegistryOptions = {
  createRoomCode?: () => string;
  maximumParticipantsPerRoom?: number;
};

export type JoinRoomResult<Participant> =
  | { isJoined: true; room: Room<Participant> }
  | { isJoined: false; errorCode: 'ROOM_NOT_FOUND' | 'ROOM_FULL' };

/** Every open room, by code, in this process's memory (D-004). */
export function createRoomRegistry<Participant extends { participantId: string }>({
  createRoomCode = generateRoomCode,
  maximumParticipantsPerRoom = MAX_PARTICIPANTS_PER_ROOM,
}: RoomRegistryOptions = {}) {
  const roomsByCode = new Map<string, Room<Participant>>();

  function createUnusedRoomCode(): string {
    let roomCode = createRoomCode();
    while (roomsByCode.has(roomCode)) {
      roomCode = createRoomCode();
    }
    return roomCode;
  }

  return {
    createRoom(creator: Participant): Room<Participant> & { roomCode: string } {
      const roomCode = createUnusedRoomCode();
      const room = { ...createEmptyRoom<Participant>(roomCode), roomCode };
      room.participants.set(creator.participantId, creator);
      roomsByCode.set(roomCode, room);
      return room;
    },

    findRoom(roomCode: string): Room<Participant> | null {
      return roomsByCode.get(roomCode) ?? null;
    },

    joinRoom(roomCode: string, participant: Participant): JoinRoomResult<Participant> {
      const room = roomsByCode.get(roomCode);
      if (!room) {
        return { isJoined: false, errorCode: 'ROOM_NOT_FOUND' };
      }
      if (room.participants.size >= maximumParticipantsPerRoom) {
        return { isJoined: false, errorCode: 'ROOM_FULL' };
      }
      room.participants.set(participant.participantId, participant);
      return { isJoined: true, room };
    },

    /** A room closes when its last participant leaves. Also works for a table room. */
    leaveRoom(room: Room<Participant>, participantId: string): void {
      room.participants.delete(participantId);
      if (room.participants.size === 0 && room.roomCode !== null) {
        roomsByCode.delete(room.roomCode);
      }
    },
  };
}

export type RoomRegistry<Participant extends { participantId: string }> = ReturnType<
  typeof createRoomRegistry<Participant>
>;
