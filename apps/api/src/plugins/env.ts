import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { z } from 'zod';

const DEFAULT_PORT = 4400;
const DEFAULT_ALLOWED_WEB_ORIGINS = 'http://localhost:3400';
const DEFAULT_META_TRANSCRIPTION_URL = 'wss://api.meta.ai/v1/asr/realtime';
const DEFAULT_META_CHAT_COMPLETIONS_URL = 'https://api.meta.ai/v1/chat/completions';
// Verified in Phase 0; the -contributor variants train on prompts, so not for people's talk (D-006).
const DEFAULT_META_TRANSLATION_MODEL_ID = 'muse-spark-1.3';
// A forgotten open mic stops within the hour (D-017).
const DEFAULT_MAX_ROOM_DURATION_MINUTES = 60;
// How long a room keeps the seat of a phone whose socket dropped (D-017).
const DEFAULT_PARTICIPANT_RECONNECT_GRACE_SECONDS = 60;
// The faster of two Muse Spark requests cuts the wait for the first word (D-020).
const DEFAULT_TRANSLATION_PARALLEL_REQUEST_COUNT = 2;
const MAXIMUM_TRANSLATION_PARALLEL_REQUEST_COUNT = 4;
// Past this lag behind real time, the API pads Meta's audio with silence (D-024).
const DEFAULT_TRANSCRIPTION_MAXIMUM_AUDIO_LAG_MILLISECONDS = 400;
// Who speaks the translation: each phone's own voice (D-007), or a voice API through us (D-021).
export const SPEECH_PROVIDERS = ['browser', 'elevenlabs', 'cartesia'] as const;
export type SpeechProvider = (typeof SPEECH_PROVIDERS)[number];
const DEFAULT_ELEVENLABS_API_BASE_URL = 'https://api.elevenlabs.io';
const DEFAULT_ELEVENLABS_MODEL_ID = 'eleven_flash_v2_5';
const DEFAULT_CARTESIA_API_BASE_URL = 'https://api.cartesia.ai';
const DEFAULT_CARTESIA_MODEL_ID = 'sonic-3';
const DEFAULT_CLOUDFLARE_TURN_API_BASE_URL = 'https://rtc.live.cloudflare.com';
const MISSING_META_API_KEY_MESSAGE =
  'is required. Copy apps/api/.env.example to apps/api/.env and set your Meta Model API key.';

function toCommaSeparatedList(commaSeparatedText: string): string[] {
  return commaSeparatedText
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export const apiEnvSchema = z
  .object({
    META_API_KEY: z
      .string({ error: MISSING_META_API_KEY_MESSAGE })
      .trim()
      .min(1, { error: MISSING_META_API_KEY_MESSAGE }),
    /** Overridden by tests, which point it at a fake Meta server (D-012). */
    META_TRANSCRIPTION_URL: z.url().default(DEFAULT_META_TRANSCRIPTION_URL),
    META_CHAT_COMPLETIONS_URL: z.url().default(DEFAULT_META_CHAT_COMPLETIONS_URL),
    META_TRANSLATION_MODEL_ID: z.string().min(1).default(DEFAULT_META_TRANSLATION_MODEL_ID),
    /** `1` turns the race off. */
    TRANSLATION_PARALLEL_REQUEST_COUNT: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAXIMUM_TRANSLATION_PARALLEL_REQUEST_COUNT)
      .default(DEFAULT_TRANSLATION_PARALLEL_REQUEST_COUNT),
    /** `0` turns the padding off: only the phone's own audio is forwarded. */
    TRANSCRIPTION_MAXIMUM_AUDIO_LAG_MILLISECONDS: z.coerce
      .number()
      .int()
      .min(0)
      .default(DEFAULT_TRANSCRIPTION_MAXIMUM_AUDIO_LAG_MILLISECONDS),
    PORT: z.coerce.number().int().min(1).max(65_535).default(DEFAULT_PORT),
    /** Tests use fractions to reach the limits in milliseconds. */
    MAX_ROOM_DURATION_MINUTES: z.coerce
      .number()
      .positive()
      .default(DEFAULT_MAX_ROOM_DURATION_MINUTES),
    PARTICIPANT_RECONNECT_GRACE_SECONDS: z.coerce
      .number()
      .positive()
      .default(DEFAULT_PARTICIPANT_RECONNECT_GRACE_SECONDS),
    ALLOWED_WEB_ORIGINS: z
      .string()
      .default(DEFAULT_ALLOWED_WEB_ORIGINS)
      .transform(toCommaSeparatedList)
      .pipe(z.array(z.url({ error: 'must be a comma-separated list of origins' }))),
    SPEECH_PROVIDER: z.enum(SPEECH_PROVIDERS).default('browser'),
    /**
     * The provider's voice ids, comma-separated. A room's first participant is spoken in the first
     * voice, the second in the second, so the two people sound different (D-021).
     */
    SPEECH_VOICE_IDS: z.string().default('').transform(toCommaSeparatedList),
    ELEVENLABS_API_KEY: z.string().trim().default(''),
    /** Tests point the base URLs at a fake speech server (D-012). */
    ELEVENLABS_API_BASE_URL: z.url().default(DEFAULT_ELEVENLABS_API_BASE_URL),
    ELEVENLABS_MODEL_ID: z.string().min(1).default(DEFAULT_ELEVENLABS_MODEL_ID),
    CARTESIA_API_KEY: z.string().trim().default(''),
    CARTESIA_API_BASE_URL: z.url().default(DEFAULT_CARTESIA_API_BASE_URL),
    CARTESIA_MODEL_ID: z.string().min(1).default(DEFAULT_CARTESIA_MODEL_ID),
    /**
     * Optional Cloudflare TURN key (D-023). Without it, phones find each other through free STUN
     * only, which some mobile networks block; the call then works without the real voice.
     */
    CLOUDFLARE_TURN_KEY_ID: z.string().trim().default(''),
    CLOUDFLARE_TURN_API_TOKEN: z.string().trim().default(''),
    CLOUDFLARE_TURN_API_BASE_URL: z.url().default(DEFAULT_CLOUDFLARE_TURN_API_BASE_URL),
  })
  .superRefine((env, context) => {
    if (env.SPEECH_PROVIDER === 'browser') {
      return;
    }
    const providerApiKey =
      env.SPEECH_PROVIDER === 'elevenlabs' ? env.ELEVENLABS_API_KEY : env.CARTESIA_API_KEY;
    if (providerApiKey.length === 0) {
      context.addIssue({
        code: 'custom',
        path: [env.SPEECH_PROVIDER === 'elevenlabs' ? 'ELEVENLABS_API_KEY' : 'CARTESIA_API_KEY'],
        message: `is required when SPEECH_PROVIDER=${env.SPEECH_PROVIDER}.`,
      });
    }
    if (env.SPEECH_VOICE_IDS.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['SPEECH_VOICE_IDS'],
        message: `needs at least one voice id when SPEECH_PROVIDER=${env.SPEECH_PROVIDER}. Run bun run compare:voices to list them.`,
      });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export class InvalidEnvError extends Error {
  override name = 'InvalidEnvError';
}

export function parseApiEnv(variables: Record<string, string | undefined>): ApiEnv {
  const result = apiEnvSchema.safeParse(variables);
  if (result.success) {
    return result.data;
  }

  const problems = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(root)'} ${issue.message}`,
  );
  throw new InvalidEnvError(['The API cannot start. Invalid environment:', ...problems].join('\n'));
}

declare module 'fastify' {
  interface FastifyInstance {
    env: ApiEnv;
  }
}

/** Makes the parsed env available as `server.env` to every route and handler. */
export const envPlugin = fastifyPlugin(
  async (server: FastifyInstance, options: { env: ApiEnv }) => {
    server.decorate('env', options.env);
  },
  { name: 'env' },
);
