import type { ConversationConnection } from './conversation-connection';
import { leaveCurrentRoom } from './handle-leave-room';
import { broadcastRoomState, cancelTranslationsWithoutListeners } from './room-messages';
import { closeAllTranscriptions } from './transcription-lifecycle';

const MILLISECONDS_PER_SECOND = 1000;

/**
 * The socket closed without `leave_room`. Mobile data drops sockets, so a room keeps the seat
 * for `PARTICIPANT_RECONNECT_GRACE_SECONDS` and the phone can take it back with
 * `join_room { previousParticipantId }` (D-017). A table session ends at once, as before.
 */
export function handleSocketClosed(connection: ConversationConnection): void {
  const { membership } = connection;
  if (membership === null || membership.room.roomCode === null) {
    leaveCurrentRoom(connection);
    return;
  }
  const { room } = membership;
  // Nobody is speaking into this seat now; a translation only this phone would hear is wasted.
  closeAllTranscriptions(connection);
  connection.reconnectGraceTimeout = setTimeout(() => {
    connection.reconnectGraceTimeout = null;
    connection.logger.info({ roomCode: room.roomCode }, 'the phone did not come back: seat freed');
    leaveCurrentRoom(connection);
  }, connection.env.PARTICIPANT_RECONNECT_GRACE_SECONDS * MILLISECONDS_PER_SECOND);
  // A kept seat mustn't keep the process alive when the server shuts down.
  connection.reconnectGraceTimeout.unref();
  connection.logger.info({ roomCode: room.roomCode }, 'socket dropped: keeping the seat');
  cancelTranslationsWithoutListeners(room);
  broadcastRoomState(room);
}
