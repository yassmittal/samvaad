import { type ErrorCode, type JoinRoomMessage, SEAT_TAKEN_OVER_CLOSE_CODE } from '@samvaad/shared';
import type { ConversationConnection, ConversationRoom } from './conversation-connection';
import { leaveCurrentRoom } from './handle-leave-room';
import { createConversationContextMessage } from './handle-update-conversation-context';
import { broadcastRoomState } from './room-messages';
import { closeAllTranscriptions } from './transcription-lifecycle';

const JOIN_FAILURE_MESSAGE = {
  ROOM_NOT_FOUND: 'No room has this code. Rooms close when everyone has left.',
  ROOM_FULL: 'This room is full.',
} as const satisfies Partial<Record<ErrorCode, string>>;

/**
 * A phone coming back (D-017): this socket takes over the seat and its participant id. The
 * old socket may still look open to the API (a phone that changed networks), so it is cut off
 * from the room and closed. `null` when there is no seat to take back.
 */
function reclaimSeat(
  connection: ConversationConnection,
  roomCode: string,
  previousParticipantId: string,
): ConversationRoom | null {
  const reclaimed = connection.roomRegistry.reclaimSeat(
    roomCode,
    previousParticipantId,
    connection,
  );
  if (reclaimed === null) {
    return null;
  }
  const { previousParticipant } = reclaimed;
  if (previousParticipant.reconnectGraceTimeout !== null) {
    clearTimeout(previousParticipant.reconnectGraceTimeout);
    previousParticipant.reconnectGraceTimeout = null;
  }
  closeAllTranscriptions(previousParticipant);
  previousParticipant.membership = null;
  previousParticipant.closeSocket(SEAT_TAKEN_OVER_CLOSE_CODE, 'Another connection took this seat');
  connection.participantId = previousParticipantId;
  connection.logger.info({ roomCode }, 'a phone came back and took its seat');
  return reclaimed.room;
}

function joinAsNewParticipant(
  connection: ConversationConnection,
  roomCode: string,
): ConversationRoom | null {
  const joinResult = connection.roomRegistry.joinRoom(roomCode, connection);
  if (!joinResult.isJoined) {
    connection.sendServerMessage({
      type: 'error',
      code: joinResult.errorCode,
      message: JOIN_FAILURE_MESSAGE[joinResult.errorCode],
    });
    return null;
  }
  return joinResult.room;
}

export function handleJoinRoom(connection: ConversationConnection, message: JoinRoomMessage): void {
  leaveCurrentRoom(connection);
  const reclaimedRoom =
    message.previousParticipantId === undefined
      ? null
      : reclaimSeat(connection, message.roomCode, message.previousParticipantId);
  const room = reclaimedRoom ?? joinAsNewParticipant(connection, message.roomCode);
  if (room === null) {
    return;
  }
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
  // The context someone set before this phone joined (D-016).
  connection.sendServerMessage(createConversationContextMessage(room.context, null));
  broadcastRoomState(room);
}
