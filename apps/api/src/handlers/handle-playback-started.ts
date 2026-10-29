import type { PlaybackStartedMessage } from '@samvaad/shared';
import type { ConversationConnection } from './conversation-connection';

/** Phase 3 sends this when the listener's phone starts speaking. Logged for now. */
export function handlePlaybackStarted(
  connection: ConversationConnection,
  message: PlaybackStartedMessage,
): void {
  connection.logger.info(
    {
      utteranceId: message.utteranceId,
      startedAtEpochMilliseconds: message.startedAtEpochMilliseconds,
    },
    'playback started',
  );
}
