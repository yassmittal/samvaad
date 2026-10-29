import type { MicrophoneStateMessage } from '@samvaad/shared';
import type { ConversationConnection } from './conversation-connection';
import { broadcastRoomState } from './room-messages';
import { endTranscription, startTranscription } from './transcription-lifecycle';

export function handleMicrophoneState(
  connection: ConversationConnection,
  message: MicrophoneStateMessage,
): void {
  const { membership } = connection;
  if (!message.isOpen) {
    const wasOpen = connection.activeTranscription !== null;
    endTranscription(connection);
    if (wasOpen && membership) {
      broadcastRoomState(membership.room);
    }
    return;
  }
  if (membership === null) {
    connection.sendServerMessage({
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Start a table session or join a room before opening the microphone.',
    });
    return;
  }
  if (connection.activeTranscription) {
    return;
  }
  connection.hasReportedMicrophoneNotOpen = false;
  startTranscription(connection);
  broadcastRoomState(membership.room);
}
