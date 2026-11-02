import {
  type LanguageCode,
  TRANSLATION_AUDIO_BYTES_PER_SAMPLE,
  TRANSLATION_AUDIO_SAMPLE_RATE_HERTZ,
} from '@samvaad/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { TranslationOutput } from '../lib/translation-output';
import type { SpeechSynthesisClient } from '../services/speech-synthesis-client';

const MILLISECONDS_PER_SECOND = 1000;

type TranslationAudioOptions = {
  speechSynthesisClient: SpeechSynthesisClient;
  voiceId: string;
  logger: FastifyBaseLogger;
  signal: AbortSignal;
};

function calculateAudioDurationMilliseconds(audioByteCount: number): number {
  const sampleCount = audioByteCount / TRANSLATION_AUDIO_BYTES_PER_SAMPLE;
  return Math.round((sampleCount / TRANSLATION_AUDIO_SAMPLE_RATE_HERTZ) * MILLISECONDS_PER_SECOND);
}

/**
 * Speaks one finished translation: its audio chunks as they are made, then
 * `translation_audio_end`. Never throws: a failure is `translation_audio_end { hasFailed }`,
 * and the phone speaks the text with its own voice instead (D-021).
 */
async function* produceTranslationAudio(
  {
    utteranceId,
    text,
    languageCode,
  }: { utteranceId: string; text: string; languageCode: LanguageCode },
  { speechSynthesisClient, voiceId, logger, signal }: TranslationAudioOptions,
): AsyncGenerator<TranslationOutput> {
  const startedAtEpochMilliseconds = Date.now();
  let firstAudioAtEpochMilliseconds: number | null = null;
  let audioByteCount = 0;
  try {
    for await (const audio of speechSynthesisClient.streamSpeech({
      text,
      languageCode,
      voiceId,
      signal,
    })) {
      firstAudioAtEpochMilliseconds ??= Date.now();
      audioByteCount += audio.length;
      yield { type: 'translation_audio_chunk', utteranceId, audio };
    }
  } catch (error) {
    if (signal.aborted) {
      return;
    }
    logger.warn({ err: error, utteranceId }, 'speech synthesis failed');
    yield { type: 'translation_audio_end', utteranceId, hasFailed: true };
    return;
  }
  logger.info(
    {
      utteranceId,
      speechProvider: speechSynthesisClient.provider,
      translationCompleteToFirstAudioMilliseconds:
        firstAudioAtEpochMilliseconds === null
          ? null
          : firstAudioAtEpochMilliseconds - startedAtEpochMilliseconds,
      audioDurationMilliseconds: calculateAudioDurationMilliseconds(audioByteCount),
    },
    'translation audio complete',
  );
  yield { type: 'translation_audio_end', utteranceId, hasFailed: audioByteCount === 0 };
}

/**
 * Passes a translation's messages through and, after each `translation_complete`, adds its
 * speech (D-021). Without a speech client, or without a voice, the messages pass unchanged and
 * the phone speaks the text itself (D-007).
 */
export async function* addTranslationAudio(
  messages: AsyncIterable<TranslationOutput>,
  options: Omit<TranslationAudioOptions, 'speechSynthesisClient' | 'voiceId'> & {
    speechSynthesisClient: SpeechSynthesisClient | null;
    voiceId: string | null;
  },
): AsyncGenerator<TranslationOutput> {
  const { speechSynthesisClient, voiceId } = options;
  for await (const message of messages) {
    if (
      message.type !== 'translation_complete' ||
      speechSynthesisClient === null ||
      voiceId === null
    ) {
      yield message;
      continue;
    }
    yield { ...message, hasTranslationAudio: true };
    yield* produceTranslationAudio(
      {
        utteranceId: message.utteranceId,
        text: message.text,
        languageCode: message.targetLanguageCode,
      },
      { ...options, speechSynthesisClient, voiceId },
    );
  }
}
