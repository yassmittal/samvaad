import { randomUUID } from 'node:crypto';
import { SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';
import { createUtteranceTracker } from '../lib/utterance-tracker';
import {
  createMetaTranscriptionStream,
  type MetaTranscriptionStream,
} from '../services/meta-transcription-stream';
import type { ConversationConnection } from './conversation-connection';

// Meta caps a session at 60 minutes (D-005). Hand over to a fresh stream well before that.
export const TRANSCRIPTION_STREAM_ROTATION_MILLISECONDS = 55 * 60 * 1000;

function openTranscriptionStream(connection: ConversationConnection): MetaTranscriptionStream {
  const languageCodes = connection.tableSessionLanguageCodes ?? [];
  // One tracker per stream: after a rotation, the old stream still finishes its own utterance.
  const utteranceTracker = createUtteranceTracker({ createUtteranceId: randomUUID });

  const stream = createMetaTranscriptionStream({
    transcriptionUrl: connection.env.META_TRANSCRIPTION_URL,
    metaApiKey: connection.env.META_API_KEY,
    languageBias: languageCodes.map(
      (languageCode) => SUPPORTED_LANGUAGE_BY_CODE[languageCode].englishName,
    ),
    logger: connection.logger,
    callbacks: {
      onSpeechStarted(turnId) {
        utteranceTracker.startUtterance(turnId);
      },
      onPartialTranscript(text) {
        const utterance = utteranceTracker.findCurrentUtterance();
        connection.sendServerMessage({
          type: 'transcript_partial',
          utteranceId: utterance.utteranceId,
          text,
        });
      },
      onSpeechEnded(turnId, speechEndedAtEpochMilliseconds) {
        utteranceTracker.markSpeechEnded(turnId, speechEndedAtEpochMilliseconds);
      },
      onFinalTranscript(turnId, text) {
        const utterance = utteranceTracker.finishUtterance(turnId);
        if (text.trim().length === 0) {
          return;
        }
        connection.sendServerMessage({
          type: 'transcript_final',
          utteranceId: utterance.utteranceId,
          speakerParticipantId: connection.participantId,
          // Table mode: the transcriber doesn't say which of the two languages it heard (D-008).
          languageCode: null,
          text,
          speechEndedAtEpochMilliseconds: utterance.speechEndedAtEpochMilliseconds ?? Date.now(),
        });
      },
      onFailed() {
        if (connection.activeTranscription?.stream === stream) {
          clearTimeout(connection.activeTranscription.rotationTimeout);
          connection.activeTranscription = null;
        }
        connection.sendServerMessage({
          type: 'error',
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'Speech recognition is unavailable right now. Try the microphone again.',
        });
      },
      onClosed() {
        connection.openTranscriptionStreams.delete(stream);
      },
    },
  });

  connection.openTranscriptionStreams.add(stream);
  return stream;
}

export function startTranscription(connection: ConversationConnection): void {
  const stream = openTranscriptionStream(connection);
  const rotationTimeout = setTimeout(() => {
    rotateTranscription(connection);
  }, TRANSCRIPTION_STREAM_ROTATION_MILLISECONDS);
  connection.activeTranscription = { stream, rotationTimeout };
}

function rotateTranscription(connection: ConversationConnection): void {
  if (!connection.activeTranscription) {
    return;
  }
  connection.logger.info('rotating the transcription stream before the 60-minute cap');
  const previousStream = connection.activeTranscription.stream;
  startTranscription(connection);
  previousStream.end();
}

/** Mic off: Meta finishes the utterance in progress, then the stream closes (D-005). */
export function endTranscription(connection: ConversationConnection): void {
  if (!connection.activeTranscription) {
    return;
  }
  clearTimeout(connection.activeTranscription.rotationTimeout);
  connection.activeTranscription.stream.end();
  connection.activeTranscription = null;
}

/** The browser is gone: nobody is left to receive results, so close everything now. */
export function closeAllTranscriptions(connection: ConversationConnection): void {
  if (connection.activeTranscription) {
    clearTimeout(connection.activeTranscription.rotationTimeout);
    connection.activeTranscription = null;
  }
  for (const stream of connection.openTranscriptionStreams) {
    stream.close();
  }
  connection.openTranscriptionStreams.clear();
}
