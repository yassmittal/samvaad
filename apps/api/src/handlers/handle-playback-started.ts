import type { PlaybackStartedMessage } from '@samvaad/shared';
import type { ConversationConnection } from './conversation-connection';

/** The speaker's ✓✓: the other phone started speaking their utterance (D-022). */
function sendHeardReceipt(connection: ConversationConnection, utteranceId: string): void {
  const room = connection.membership?.room;
  const utterance = room?.utterances.find((candidate) => candidate.utteranceId === utteranceId);
  const speaker = utterance && room?.participants.get(utterance.speakerParticipantId);
  if (speaker === undefined || speaker === connection) {
    return;
  }
  speaker.sendServerMessage({ type: 'utterance_receipt', utteranceId, receipt: 'heard' });
}

/**
 * The listener's phone started speaking a translation: tell the speaker, and log the whole
 * delay, from the end of the speech to the first spoken word (D-011). Measured on this
 * server's clock, from when the message arrives, because the phone's clock may differ from
 * ours; that adds one network hop.
 */
export function handlePlaybackStarted(
  connection: ConversationConnection,
  message: PlaybackStartedMessage,
): void {
  sendHeardReceipt(connection, message.utteranceId);
  const timings = connection.playbackTimings.take(message.utteranceId);
  if (timings === null) {
    connection.logger.warn(
      { utteranceId: message.utteranceId },
      'playback started for an utterance with no translation timings',
    );
    return;
  }
  const playbackStartedAtEpochMilliseconds = Date.now();
  connection.logger.info(
    {
      utteranceId: message.utteranceId,
      speechEndToPlaybackStartMilliseconds:
        playbackStartedAtEpochMilliseconds - timings.speechEndedAtEpochMilliseconds,
      translationCompleteToPlaybackStartMilliseconds:
        playbackStartedAtEpochMilliseconds - timings.translationCompleteAtEpochMilliseconds,
    },
    'playback started',
  );
}
