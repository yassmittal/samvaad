import { type LanguageCode, TRANSLATION_AUDIO_SAMPLE_RATE_HERTZ } from '@samvaad/shared';
import type { FastifyBaseLogger } from 'fastify';
import { alignToWholeSamples } from '../lib/align-to-whole-samples';
import type { ApiEnv, SpeechProvider } from '../plugins/env';

export const SPEECH_SYNTHESIS_TIMEOUT_MILLISECONDS = 10_000;
const TOO_MANY_REQUESTS_STATUS = 429;
// Two retries, then the phone's own voice: past a second, a late voice is worse than a plain one.
const RATE_LIMIT_RETRY_DELAYS_MILLISECONDS = [250, 600];
// Cartesia versions its API by date; this is the one the request below is written against.
const CARTESIA_API_VERSION = '2025-04-16';

export class SpeechSynthesisFailedError extends Error {
  override name = 'SpeechSynthesisFailedError';
}

export type StreamSpeechInput = {
  text: string;
  languageCode: LanguageCode;
  voiceId: string;
  /** Aborts the request, for example when nobody can hear the translation any more. */
  signal: AbortSignal;
};

type SpeechRequest = { url: string; init: RequestInit };

type ProviderSettings = {
  apiBaseUrl: string;
  apiKey: string;
  modelId: string;
};

/** ElevenLabs' streaming endpoint, raw PCM out (D-021). */
function buildElevenLabsRequest(
  { apiBaseUrl, apiKey, modelId }: ProviderSettings,
  { text, languageCode, voiceId }: StreamSpeechInput,
): SpeechRequest {
  const url = new URL(`/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`, apiBaseUrl);
  url.searchParams.set('output_format', `pcm_${TRANSLATION_AUDIO_SAMPLE_RATE_HERTZ}`);
  return {
    url: url.toString(),
    init: {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: modelId, language_code: languageCode }),
    },
  };
}

/** Cartesia's bytes endpoint, which streams raw PCM as it is made (D-021). */
function buildCartesiaRequest(
  { apiBaseUrl, apiKey, modelId }: ProviderSettings,
  { text, languageCode, voiceId }: StreamSpeechInput,
): SpeechRequest {
  return {
    url: new URL('/tts/bytes', apiBaseUrl).toString(),
    init: {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Cartesia-Version': CARTESIA_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: modelId,
        transcript: text,
        voice: { mode: 'id', id: voiceId },
        language: languageCode,
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: TRANSLATION_AUDIO_SAMPLE_RATE_HERTZ,
        },
      }),
    },
  };
}

const REQUEST_BUILDERS = {
  elevenlabs: buildElevenLabsRequest,
  cartesia: buildCartesiaRequest,
} as const satisfies Record<Exclude<SpeechProvider, 'browser'>, unknown>;

function findProviderSettings(
  env: ApiEnv,
  provider: Exclude<SpeechProvider, 'browser'>,
): ProviderSettings {
  return provider === 'elevenlabs'
    ? {
        apiBaseUrl: env.ELEVENLABS_API_BASE_URL,
        apiKey: env.ELEVENLABS_API_KEY,
        modelId: env.ELEVENLABS_MODEL_ID,
      }
    : {
        apiBaseUrl: env.CARTESIA_API_BASE_URL,
        apiKey: env.CARTESIA_API_KEY,
        modelId: env.CARTESIA_MODEL_ID,
      };
}

/**
 * Speaks a translation with a voice API (D-021). `null` when `SPEECH_PROVIDER=browser`: each
 * phone then speaks with its own voice (D-007). Only this file talks to a voice API.
 */
export function createSpeechSynthesisClient({
  env,
  logger,
  timeoutMilliseconds = SPEECH_SYNTHESIS_TIMEOUT_MILLISECONDS,
}: {
  env: ApiEnv;
  logger: Pick<FastifyBaseLogger, 'debug'>;
  /** Tests shorten it. */
  timeoutMilliseconds?: number;
}) {
  const provider = env.SPEECH_PROVIDER;
  if (provider === 'browser') {
    return null;
  }
  const providerSettings = findProviderSettings(env, provider);
  const buildRequest = REQUEST_BUILDERS[provider];

  return {
    provider,
    voiceIds: env.SPEECH_VOICE_IDS,

    /**
     * Yields 24 kHz mono PCM16 chunks of whole samples as the voice API makes them.
     * Throws `SpeechSynthesisFailedError`.
     */
    async *streamSpeech(input: StreamSpeechInput): AsyncGenerator<Uint8Array> {
      const { url, init } = buildRequest(providerSettings, input);
      let response: Response;
      // Free plans cap concurrent requests (Cartesia answers 429): wait a moment and try again
      // rather than fall back to the phone's own voice (D-024).
      for (let attemptIndex = 0; ; attemptIndex += 1) {
        try {
          response = await fetch(url, {
            ...init,
            signal: AbortSignal.any([input.signal, AbortSignal.timeout(timeoutMilliseconds)]),
          });
        } catch (error) {
          throw new SpeechSynthesisFailedError(`${provider} request failed: ${String(error)}`);
        }
        const retryDelayMilliseconds = RATE_LIMIT_RETRY_DELAYS_MILLISECONDS[attemptIndex];
        if (
          response.status !== TOO_MANY_REQUESTS_STATUS ||
          retryDelayMilliseconds === undefined ||
          input.signal.aborted
        ) {
          break;
        }
        await response.body?.cancel();
        logger.debug({ provider, attemptIndex }, 'voice API busy (429): retrying');
        await Bun.sleep(retryDelayMilliseconds);
      }
      if (!response.ok || response.body === null) {
        const responseText = await response.text().catch(() => '');
        throw new SpeechSynthesisFailedError(
          `${provider} HTTP ${response.status}: ${responseText.slice(0, 300)}`,
        );
      }
      try {
        yield* alignToWholeSamples(response.body);
      } catch (error) {
        throw new SpeechSynthesisFailedError(`${provider} stream broke: ${String(error)}`);
      }
    },

    /** Opens the HTTPS connection before the first translation needs it, like Muse Spark's (D-014). */
    warmConnection(): void {
      fetch(providerSettings.apiBaseUrl)
        .then((response) => response.body?.cancel())
        .catch((error: unknown) => logger.debug({ err: error }, 'speech warm-up failed'));
    },
  };
}

export type SpeechSynthesisClient = NonNullable<ReturnType<typeof createSpeechSynthesisClient>>;
