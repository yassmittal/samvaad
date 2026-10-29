import type { StartTableSessionMessage } from '@samvaad/shared';
import { createTableRoom } from '../rooms/room';
import type { ConversationConnection } from './conversation-connection';
import { leaveCurrentRoom } from './handle-leave-room';
import { endTranscription } from './transcription-lifecycle';

export function handleStartTableSession(
  connection: ConversationConnection,
  message: StartTableSessionMessage,
): void {
  // New languages mean a new language bias, which is fixed at Meta's handshake (D-005).
  endTranscription(connection);
  const { membership } = connection;
  if (membership !== null && membership.room.roomCode === null) {
    // Same table, new languages: translations still running finish as before.
    membership.languageCodes = message.languageCodes;
  } else {
    leaveCurrentRoom(connection);
    connection.membership = {
      room: createTableRoom(connection),
      participantName: null,
      languageCodes: message.languageCodes,
    };
  }
  connection.translationClient.warmConnection();
  connection.sendServerMessage({
    type: 'session_ready',
    participantId: connection.participantId,
    languageCodes: message.languageCodes,
  });
}
