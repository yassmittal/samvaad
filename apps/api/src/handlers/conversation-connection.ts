import type { LanguageCode, ServerMessage } from '@samvaad/shared';
import type { FastifyBaseLogger } from 'fastify';
import { createOrderedDelivery } from '../lib/create-ordered-delivery';
import {
  createPlaybackTimingsStore,
  type PlaybackTimingsStore,
} from '../lib/create-playback-timings-store';
import type { ApiEnv } from '../plugins/env';
import type { MetaTranscriptionStream } from '../services/meta-transcription-stream';
import {
  createMetaTranslationClient,
  type MetaTranslationClient,
} from '../services/meta-translation-client';

export type ActiveTranscription = {
  stream: MetaTranscriptionStream;
  rotationTimeout: ReturnType<typeof setTimeout>;
};

/** Everything the API knows about one browser's socket. Lives as long as the socket (D-004). */
export type ConversationConnection = {
  participantId: string;
  env: ApiEnv;
  logger: FastifyBaseLogger;
  sendServerMessage: (message: ServerMessage) => void;
  tableSessionLanguageCodes: [LanguageCode, LanguageCode] | null;
  /** The stream audio frames go to. `null` while the microphone is closed. */
  activeTranscription: ActiveTranscription | null;
  /** Every upstream socket still open, including ones finishing their last utterance. */
  openTranscriptionStreams: Set<MetaTranscriptionStream>;
  hasReportedMicrophoneNotOpen: boolean;
  translationClient: MetaTranslationClient;
  /** Sends translation messages in utterance order, however fast each one finishes. */
  translationDelivery: ReturnType<typeof createOrderedDelivery<ServerMessage>>;
  /** One per translation still streaming, so a closed socket can cancel them. */
  translationAbortControllers: Set<AbortController>;
  /** Translated utterances waiting for `playback_started`, to log the whole delay (D-011). */
  playbackTimings: PlaybackTimingsStore;
};

type ConversationConnectionOptions = Pick<
  ConversationConnection,
  'participantId' | 'env' | 'logger' | 'sendServerMessage'
>;

export function createConversationConnection(
  options: ConversationConnectionOptions,
): ConversationConnection {
  return {
    ...options,
    tableSessionLanguageCodes: null,
    activeTranscription: null,
    openTranscriptionStreams: new Set(),
    hasReportedMicrophoneNotOpen: false,
    translationClient: createMetaTranslationClient({
      chatCompletionsUrl: options.env.META_CHAT_COMPLETIONS_URL,
      modelId: options.env.META_TRANSLATION_MODEL_ID,
      metaApiKey: options.env.META_API_KEY,
      logger: options.logger,
    }),
    translationDelivery: createOrderedDelivery<ServerMessage>(options.sendServerMessage),
    translationAbortControllers: new Set(),
    playbackTimings: createPlaybackTimingsStore(),
  };
}
