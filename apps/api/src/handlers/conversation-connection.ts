import type { LanguageCode, ServerMessage } from '@samvaad/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { ApiEnv } from '../plugins/env';
import type { MetaTranscriptionStream } from '../services/meta-transcription-stream';

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
  };
}
