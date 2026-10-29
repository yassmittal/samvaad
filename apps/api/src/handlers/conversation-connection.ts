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
import type { MetaTranscriptionStream } from '../services/meta-transcription-stream';
import {
  createMetaTranslationClient,
  type MetaTranslationClient,
} from '../services/meta-translation-client';

export type ActiveTranscription = {
  stream: MetaTranscriptionStream;
  rotationTimeout: ReturnType<typeof setTimeout>;
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
  participantId: string;
  env: ApiEnv;
  logger: FastifyBaseLogger;
  sendServerMessage: (message: ServerMessage) => void;
  roomRegistry: ConversationRoomRegistry;
  /** Set by `start_table_session`, `create_room` or `join_room`. */
  membership: RoomMembership | null;
  /** The stream audio frames go to. `null` while the microphone is closed. */
  activeTranscription: ActiveTranscription | null;
  /** Every upstream socket still open, including ones finishing their last utterance. */
  openTranscriptionStreams: Set<MetaTranscriptionStream>;
  hasReportedMicrophoneNotOpen: boolean;
  /** Translates this participant's utterances. */
  translationClient: MetaTranslationClient;
  /** Translations sent to this listener, waiting for `playback_started`, to log the whole delay (D-011). */
  playbackTimings: PlaybackTimingsStore;
};

type ConversationConnectionOptions = Pick<
  ConversationConnection,
  'participantId' | 'env' | 'logger' | 'sendServerMessage' | 'roomRegistry'
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
    translationClient: createMetaTranslationClient({
      chatCompletionsUrl: options.env.META_CHAT_COMPLETIONS_URL,
      modelId: options.env.META_TRANSLATION_MODEL_ID,
      metaApiKey: options.env.META_API_KEY,
      logger: options.logger,
    }),
    playbackTimings: createPlaybackTimingsStore(),
  };
}
