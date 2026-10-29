import type { StartTableSessionMessage } from '@samvaad/shared';
import type { ConversationConnection } from './conversation-connection';
import { endTranscription } from './transcription-lifecycle';

export function handleStartTableSession(
  connection: ConversationConnection,
  message: StartTableSessionMessage,
): void {
  // New languages mean a new language bias, which is fixed at Meta's handshake (D-005).
  endTranscription(connection);
  connection.tableSessionLanguageCodes = message.languageCodes;
  connection.translationClient.warmConnection();
  connection.sendServerMessage({
    type: 'session_ready',
    participantId: connection.participantId,
    languageCodes: message.languageCodes,
  });
}
