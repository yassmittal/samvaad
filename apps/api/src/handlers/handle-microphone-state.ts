import type { MicrophoneStateMessage } from '@samvaad/shared';
import type { ConversationConnection } from './conversation-connection';
import { endTranscription, startTranscription } from './transcription-lifecycle';

export function handleMicrophoneState(
  connection: ConversationConnection,
  message: MicrophoneStateMessage,
): void {
  if (!message.isOpen) {
    endTranscription(connection);
    return;
  }
  if (connection.tableSessionLanguageCodes === null) {
    connection.sendServerMessage({
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Start a session before opening the microphone.',
    });
    return;
  }
  if (connection.activeTranscription) {
    return;
  }
  connection.hasReportedMicrophoneNotOpen = false;
  startTranscription(connection);
}
