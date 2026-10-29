import type { ConversationConnection } from './conversation-connection';
import {
  broadcastRoomState,
  cancelTranslationsWithoutListeners,
  sendToRoom,
} from './room-messages';
import { closeAllTranscriptions } from './transcription-lifecycle';

/**
 * Leaves the room or table session, if any: on `leave_room`, before entering another room,
 * and when the socket closes. Translations already running for the others keep going.
 */
export function leaveCurrentRoom(connection: ConversationConnection): void {
  closeAllTranscriptions(connection);
  const { membership } = connection;
  if (membership === null) {
    return;
  }
  connection.membership = null;
  const { room } = membership;
  connection.roomRegistry.leaveRoom(room, connection.participantId);
  cancelTranslationsWithoutListeners(room);
  if (membership.participantName !== null) {
    sendToRoom(room, {
      type: 'participant_left',
      participantId: connection.participantId,
      participantName: membership.participantName,
    });
  }
  broadcastRoomState(room);
}

export function handleLeaveRoom(connection: ConversationConnection): void {
  leaveCurrentRoom(connection);
}
