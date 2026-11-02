import { randomUUID } from 'node:crypto';
import { findLanguageBias } from '../lib/find-language-bias';
import { findTranscriptionKeywords, haveSameKeywords } from '../lib/find-transcription-keywords';
import { createUtteranceTracker, type UtteranceTracker } from '../lib/utterance-tracker';
import {
  createMetaTranscriptionStream,
  type MetaTranscriptionStream,
} from '../services/meta-transcription-stream';
import type { ConversationConnection } from './conversation-connection';
import { broadcastRoomState, sendToRoom } from './room-messages';
import { startUtteranceTranslations } from './translate-utterance';

// Meta caps a session at 60 minutes (D-005). Hand over to a fresh stream well before that.
export const TRANSCRIPTION_STREAM_ROTATION_MILLISECONDS = 55 * 60 * 1000;

// A stream that worked and then broke is reopened on its own, but not in a loop (D-017).
export const MAXIMUM_AUTOMATIC_REOPENS_PER_MINUTE = 3;
const AUTOMATIC_REOPEN_WINDOW_MILLISECONDS = 60 * 1000;

// Each stream's tracker, so a glossary change can wait until its speaker is between utterances.
const utteranceTrackersByStream = new WeakMap<MetaTranscriptionStream, UtteranceTracker>();

function findCurrentKeywords(connection: ConversationConnection): string[] {
  return connection.membership
    ? findTranscriptionKeywords(connection.membership.room.context.glossaryTerms)
    : [];
}

function openTranscriptionStream(
  connection: ConversationConnection,
  keywords: string[],
): MetaTranscriptionStream {
  // One tracker per stream: after a rotation, the old stream still finishes its own utterance.
  const utteranceTracker = createUtteranceTracker({ createUtteranceId: randomUUID });

  const stream = createMetaTranscriptionStream({
    transcriptionUrl: connection.env.META_TRANSCRIPTION_URL,
    metaApiKey: connection.env.META_API_KEY,
    languageBias: connection.membership
      ? findLanguageBias(connection.membership.languageCodes)
      : [],
    keywords,
    maximumAudioLagMilliseconds: connection.env.TRANSCRIPTION_MAXIMUM_AUDIO_LAG_MILLISECONDS,
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
        refreshKeywordsIfPending(connection, stream);
        const { membership } = connection;
        if (text.trim().length === 0 || membership === null) {
          return;
        }
        const transcriptFinalAtEpochMilliseconds = Date.now();
        const speechEndedAtEpochMilliseconds =
          utterance.speechEndedAtEpochMilliseconds ?? transcriptFinalAtEpochMilliseconds;
        sendToRoom(membership.room, {
          type: 'transcript_final',
          utteranceId: utterance.utteranceId,
          speakerParticipantId: connection.participantId,
          // A table's transcriber doesn't say which of its two languages it heard (D-008).
          languageCode: membership.languageCodes.length === 1 ? membership.languageCodes[0] : null,
          text,
          speechEndedAtEpochMilliseconds,
        });
        startUtteranceTranslations(connection, membership, {
          utteranceId: utterance.utteranceId,
          utteranceText: text,
          speechEndedAtEpochMilliseconds,
          transcriptFinalAtEpochMilliseconds,
        });
      },
      onFailed({ hasStreamed }) {
        if (hasStreamed && reopenBrokenTranscription(connection, stream)) {
          return;
        }
        if (connection.activeTranscription?.stream === stream) {
          clearTimeout(connection.activeTranscription.rotationTimeout);
          connection.activeTranscription = null;
          if (connection.membership) {
            broadcastRoomState(connection.membership.room);
          }
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

  utteranceTrackersByStream.set(stream, utteranceTracker);
  connection.openTranscriptionStreams.add(stream);
  return stream;
}

export function startTranscription(connection: ConversationConnection): void {
  const keywords = findCurrentKeywords(connection);
  const stream = openTranscriptionStream(connection, keywords);
  const rotationTimeout = setTimeout(() => {
    connection.logger.info('rotating the transcription stream before the 60-minute cap');
    rotateTranscription(connection);
  }, TRANSCRIPTION_STREAM_ROTATION_MILLISECONDS);
  connection.activeTranscription = {
    stream,
    keywords,
    rotationTimeout,
    isKeywordRefreshPending: false,
  };
}

/**
 * The mic's stream worked, then Meta ended it ("Ingress audio slower than real-time", D-017).
 * The mic is still on, so open a new stream instead of making the person tap again, at most
 * `MAXIMUM_AUTOMATIC_REOPENS_PER_MINUTE` times. Returns `false` when it didn't.
 */
function reopenBrokenTranscription(
  connection: ConversationConnection,
  brokenStream: MetaTranscriptionStream,
): boolean {
  const { activeTranscription } = connection;
  if (activeTranscription?.stream !== brokenStream) {
    return false;
  }
  const nowEpochMilliseconds = Date.now();
  connection.automaticReopenEpochMilliseconds = connection.automaticReopenEpochMilliseconds.filter(
    (reopenedAtEpochMilliseconds) =>
      nowEpochMilliseconds - reopenedAtEpochMilliseconds < AUTOMATIC_REOPEN_WINDOW_MILLISECONDS,
  );
  if (connection.automaticReopenEpochMilliseconds.length >= MAXIMUM_AUTOMATIC_REOPENS_PER_MINUTE) {
    connection.logger.warn('transcription stream broke again: too many reopens, telling the phone');
    return false;
  }
  connection.automaticReopenEpochMilliseconds.push(nowEpochMilliseconds);
  connection.logger.info('transcription stream broke while the mic was on: opening a new one');
  clearTimeout(activeTranscription.rotationTimeout);
  startTranscription(connection);
  return true;
}

/** Hands over to a fresh stream; the old one finishes its own utterance, then closes. */
function rotateTranscription(connection: ConversationConnection): void {
  if (!connection.activeTranscription) {
    return;
  }
  const previousTranscription = connection.activeTranscription;
  clearTimeout(previousTranscription.rotationTimeout);
  startTranscription(connection);
  previousTranscription.stream.end();
}

function refreshKeywordsIfPending(
  connection: ConversationConnection,
  stream: MetaTranscriptionStream,
): void {
  const { activeTranscription } = connection;
  if (activeTranscription?.stream !== stream || !activeTranscription.isKeywordRefreshPending) {
    return;
  }
  if (utteranceTrackersByStream.get(stream)?.hasUtteranceInProgress()) {
    return;
  }
  connection.logger.info('glossary changed: replacing the transcription stream between utterances');
  rotateTranscription(connection);
}

/**
 * The glossary changed. Keywords are fixed at Meta's handshake (D-005), so an open stream is
 * replaced, but never mid-utterance: at once if the speaker is between utterances, otherwise
 * after the current one's final transcript (D-016). A closed mic picks them up when it opens.
 */
export function refreshTranscriptionKeywords(connection: ConversationConnection): void {
  const { activeTranscription } = connection;
  if (!activeTranscription) {
    return;
  }
  if (haveSameKeywords(activeTranscription.keywords, findCurrentKeywords(connection))) {
    activeTranscription.isKeywordRefreshPending = false;
    return;
  }
  activeTranscription.isKeywordRefreshPending = true;
  refreshKeywordsIfPending(connection, activeTranscription.stream);
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

/**
 * The participant is leaving: stop listening to them now, without waiting for the utterance
 * in progress. Their translations already running belong to the room and carry on.
 */
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
