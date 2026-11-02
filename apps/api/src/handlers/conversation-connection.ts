import type { ServerMessage } from '@samvaad/shared';
import type { FastifyBaseLogger } from 'fastify';
import {
  createPlaybackTimingsStore,
  type PlaybackTimingsStore,
} from '../lib/create-playback-timings-store';
import type { ParticipantLanguageCodes } from '../lib/plan-utterance-translations';
import type { ApiEnv } from '../plugins/env';
import type { Room } from '../rooms/room';
import type { RoomRegistry } from '../rooms/room-registry';
import { createIceServersClient, type IceServersClient } from '../services/ice-servers-client';
import type { MetaTranscriptionStream } from '../services/meta-transcription-stream';
import {
  createMetaTranslationClient,
  type MetaTranslationClient,
} from '../services/meta-translation-client';
import {
  createSpeechSynthesisClient,
  type SpeechSynthesisClient,
} from '../services/speech-synthesis-client';

export type ActiveTranscription = {
  stream: MetaTranscriptionStream;
  /** The keywords its handshake carried; fixed for the stream's life (D-005). */
  keywords: string[];
  rotationTimeout: ReturnType<typeof setTimeout>;
  /** The glossary changed mid-utterance: replace the stream once that utterance is final (D-016). */
  isKeywordRefreshPending: boolean;
};

export type ConversationRoom = Room<ConversationConnection>;
export type ConversationRoomRegistry = RoomRegistry<ConversationConnection>;

/** This connection's place in a room. A table session is a room of one (D-008). */
export type RoomMembership = {
  room: ConversationRoom;
  /** `null` at a table, where nobody else sees it. */
  participantName: string | null;
  languageCodes: ParticipantLanguageCodes;
};

/**
 * Everything the API knows about one browser's socket, which is one participant. Lives as
 * long as the socket (D-004).
 */
export type ConversationConnection = {
  /** Replaced by the old one when a phone comes back and takes its seat (D-017). */
  participantId: string;
  env: ApiEnv;
  logger: FastifyBaseLogger;
  sendServerMessage: (message: ServerMessage) => void;
  /** Sends a binary frame: a piece of a spoken translation (D-021). */
  sendBinaryFrame: (frame: Uint8Array) => void;
  /** Closes the browser's socket from the API's side, as when a newer one takes the seat. */
  closeSocket: (closeCode: number, reason: string) => void;
  roomRegistry: ConversationRoomRegistry;
  /** Set by `start_table_session`, `create_room` or `join_room`. */
  membership: RoomMembership | null;
  /** The stream audio frames go to. `null` while the microphone is closed. */
  activeTranscription: ActiveTranscription | null;
  /** Every upstream socket still open, including ones finishing their last utterance. */
  openTranscriptionStreams: Set<MetaTranscriptionStream>;
  hasReportedMicrophoneNotOpen: boolean;
  /** When this connection's broken streams were reopened on their own, to cap it (D-017). */
  automaticReopenEpochMilliseconds: number[];
  /**
   * Set while the socket is gone but the room keeps the seat (D-017). The participant is still
   * in the room, shown as not connected, and nothing is sent or translated for them.
   */
  reconnectGraceTimeout: ReturnType<typeof setTimeout> | null;
  /** Translates this participant's utterances. */
  translationClient: MetaTranslationClient;
  /** Speaks this participant's translations; `null` when phones use their own voice (D-021). */
  speechSynthesisClient: SpeechSynthesisClient | null;
  /** STUN and TURN servers for the real voice between the phones (D-023). */
  iceServersClient: IceServersClient;
  /** Translations sent to this listener, waiting for `playback_started`, to log the whole delay (D-011). */
  playbackTimings: PlaybackTimingsStore;
};

type ConversationConnectionOptions = Pick<
  ConversationConnection,
  | 'participantId'
  | 'env'
  | 'logger'
  | 'sendServerMessage'
  | 'sendBinaryFrame'
  | 'closeSocket'
  | 'roomRegistry'
>;

export function createConversationConnection(
  options: ConversationConnectionOptions,
): ConversationConnection {
  return {
    ...options,
    membership: null,
    activeTranscription: null,
    openTranscriptionStreams: new Set(),
    hasReportedMicrophoneNotOpen: false,
    automaticReopenEpochMilliseconds: [],
    reconnectGraceTimeout: null,
    translationClient: createMetaTranslationClient({
      chatCompletionsUrl: options.env.META_CHAT_COMPLETIONS_URL,
      modelId: options.env.META_TRANSLATION_MODEL_ID,
      metaApiKey: options.env.META_API_KEY,
      logger: options.logger,
      parallelRequestCount: options.env.TRANSLATION_PARALLEL_REQUEST_COUNT,
    }),
    speechSynthesisClient: createSpeechSynthesisClient({
      env: options.env,
      logger: options.logger,
    }),
    iceServersClient: createIceServersClient({ env: options.env, logger: options.logger }),
    playbackTimings: createPlaybackTimingsStore(),
  };
}
