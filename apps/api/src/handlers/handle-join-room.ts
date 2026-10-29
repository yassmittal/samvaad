import type { ErrorCode, JoinRoomMessage } from '@samvaad/shared';
import type { ConversationConnection } from './conversation-connection';
import { leaveCurrentRoom } from './handle-leave-room';
import { broadcastRoomState } from './room-messages';

const JOIN_FAILURE_MESSAGE = {
  ROOM_NOT_FOUND: 'No room has this code. Rooms close when everyone has left.',
  ROOM_FULL: 'This room is full.',
} as const satisfies Partial<Record<ErrorCode, string>>;

export function handleJoinRoom(connection: ConversationConnection, message: JoinRoomMessage): void {
  leaveCurrentRoom(connection);
  const joinResult = connection.roomRegistry.joinRoom(message.roomCode, connection);
  if (!joinResult.isJoined) {
    connection.sendServerMessage({
      type: 'error',
      code: joinResult.errorCode,
      message: JOIN_FAILURE_MESSAGE[joinResult.errorCode],
    });
    return;
  }
  const { room } = joinResult;
  connection.membership = {
    room,
    participantName: message.participantName,
    languageCodes: [message.languageCode],
  };
  connection.translationClient.warmConnection();
  connection.sendServerMessage({
    type: 'room_joined',
    roomCode: message.roomCode,
    participantId: connection.participantId,
  });
  broadcastRoomState(room);
}
