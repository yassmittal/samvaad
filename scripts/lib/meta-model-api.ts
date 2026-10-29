/**
 * Meta Model API endpoints as documented at dev.meta.ai (Oct 2026). The smoke scripts check
 * them against the live API; `docs/decisions.md` D-005 and D-006 record what they find.
 */

export const META_CHAT_COMPLETIONS_URL = 'https://api.meta.ai/v1/chat/completions';
export const META_TRANSCRIPTION_URL = 'wss://api.meta.ai/v1/asr/realtime';

export const DEFAULT_TRANSLATION_MODEL_ID = 'muse-spark-1.3';
export const TRANSCRIPTION_MODEL_ID = 'muse-voice-transcribe-1.0';

export function readMetaApiKeyOrExit(): string {
  const metaApiKey = process.env.META_API_KEY?.trim();
  if (!metaApiKey) {
    console.error(
      'META_API_KEY is missing. Copy apps/api/.env.example to apps/api/.env and set it.',
    );
    process.exit(1);
  }
  return metaApiKey;
}
