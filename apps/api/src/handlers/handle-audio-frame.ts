import type { ConversationConnection } from './conversation-connection';
import { enforceRoomTimeLimit } from './room-time-limit';

export function handleAudioFrame(connection: ConversationConnection, frame: Uint8Array): void {
  if (connection.activeTranscription) {
    if (!enforceRoomTimeLimit(connection)) {
      connection.activeTranscription.stream.sendAudioFrame(frame);
    }
    return;
  }
  // Frames still in flight after the mic closes are expected; say so once, not 12 times a second.
  if (!connection.hasReportedMicrophoneNotOpen) {
    connection.hasReportedMicrophoneNotOpen = true;
    connection.sendServerMessage({
      type: 'error',
      code: 'MICROPHONE_NOT_OPEN',
      message: 'Audio arrived while the microphone was closed and was ignored.',
    });
  }
}
