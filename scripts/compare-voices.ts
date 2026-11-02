/**
 * Phase 7.3's voice bake-off (D-021). Speaks the demo's translated lines through each voice API
 * that has a key in apps/api/.env, prints the time to the first audio and in total, and writes
 * a WAV per line to listen to. Pick the provider and voices from these, then set
 * SPEECH_PROVIDER and SPEECH_VOICE_IDS in apps/api/.env.
 *
 *   bun run compare:voices --list                 list each provider's voices (ids, names, languages)
 *   bun run compare:voices                        the first listed voice of each provider
 *   bun run compare:voices --provider elevenlabs --voice <id> --voice <id>
 *   bun run compare:voices --out /some/folder     where the WAV files go (default: a temp folder)
 *
 * Costs a little of each provider's free credit: about 600 characters per voice.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type ApiEnv, parseApiEnv, type SpeechProvider } from '../apps/api/src/plugins/env';
import { createSpeechSynthesisClient } from '../apps/api/src/services/speech-synthesis-client';
import {
  type LanguageCode,
  TRANSLATION_AUDIO_BYTES_PER_SAMPLE,
  TRANSLATION_AUDIO_SAMPLE_RATE_HERTZ,
} from '../packages/shared/src';
import { createWavFile } from './lib/write-wav-file';

type VoiceProvider = Exclude<SpeechProvider, 'browser'>;
type ListedVoice = { voiceId: string; name: string; description: string };

const BITS_PER_SAMPLE = TRANSLATION_AUDIO_BYTES_PER_SAMPLE * 8;
const CARTESIA_API_VERSION = '2025-04-16';
const MAXIMUM_LISTED_VOICE_COUNT = 40;

/** What each phone hears in the demo story: the translations from the README's context table. */
const DEMO_LINES: readonly { languageCode: LanguageCode; text: string; whatToListenFor: string }[] =
  [
    {
      languageCode: 'en',
      text: 'Hello Ms. Siobhan, this is Ramesh Kumawat from Jaipur. Our new range of blue pottery is ready.',
      whatToListenFor: 'the names Siobhan, Ramesh Kumawat, Jaipur',
    },
    {
      languageCode: 'en',
      text: 'Yes, the large platter is our best-selling piece, at four hundred and fifty rupees a piece.',
      whatToListenFor: 'a price said naturally',
    },
    {
      languageCode: 'hi',
      text: 'अगर मैं तीन सौ लूँ तो क्या आप चार सौ पच्चीस कर देंगे?',
      whatToListenFor: 'Hindi numbers, a question',
    },
    {
      languageCode: 'hi',
      text: 'कृपया इनवॉइस डॉयल होम में शिवॉन डॉयल को भेज दीजिए, और मैं तीस प्रतिशत एडवांस में पे कर दूँगी।',
      whatToListenFor: 'English words in Devanagari (इनवॉइस, एडवांस), a foreign name',
    },
    {
      languageCode: 'hi',
      text: 'जी, बड़ी थाली हमारा सबसे ज़्यादा बिकने वाला पीस है।',
      whatToListenFor: 'everyday Hindi with an English loanword (पीस)',
    },
  ];

const { values: options } = parseArgs({
  options: {
    list: { type: 'boolean', default: false },
    provider: { type: 'string' },
    voice: { type: 'string', multiple: true, default: [] },
    out: { type: 'string', default: join(tmpdir(), 'samvaad-voices') },
  },
});

function findConfiguredProviders(): VoiceProvider[] {
  const providers: VoiceProvider[] = [];
  if (process.env.ELEVENLABS_API_KEY?.trim()) {
    providers.push('elevenlabs');
  }
  if (process.env.CARTESIA_API_KEY?.trim()) {
    providers.push('cartesia');
  }
  if (options.provider !== undefined) {
    return providers.filter((provider) => provider === options.provider);
  }
  return providers;
}

function createProviderEnv(provider: VoiceProvider, voiceIds: string[]): ApiEnv {
  return parseApiEnv({
    ...process.env,
    META_API_KEY: process.env.META_API_KEY || 'not-needed-for-voices',
    SPEECH_PROVIDER: provider,
    SPEECH_VOICE_IDS: voiceIds.join(','),
  });
}

async function listElevenLabsVoices(env: ApiEnv): Promise<ListedVoice[]> {
  const response = await fetch(new URL('/v1/voices', env.ELEVENLABS_API_BASE_URL), {
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs voices: HTTP ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as {
    voices: { voice_id: string; name: string; labels?: Record<string, string> }[];
  };
  return body.voices.map((voice) => ({
    voiceId: voice.voice_id,
    name: voice.name,
    description: Object.values(voice.labels ?? {}).join(', '),
  }));
}

async function listCartesiaVoices(env: ApiEnv): Promise<ListedVoice[]> {
  const url = new URL('/voices', env.CARTESIA_API_BASE_URL);
  url.searchParams.set('limit', String(MAXIMUM_LISTED_VOICE_COUNT));
  const response = await fetch(url, {
    headers: { 'X-API-Key': env.CARTESIA_API_KEY, 'Cartesia-Version': CARTESIA_API_VERSION },
  });
  if (!response.ok) {
    throw new Error(`Cartesia voices: HTTP ${response.status} ${await response.text()}`);
  }
  // The API has answered both a bare list and a paginated `{ data }` over its versions.
  const body = (await response.json()) as
    | { id: string; name: string; language?: string; description?: string }[]
    | { data: { id: string; name: string; language?: string; description?: string }[] };
  const voices = Array.isArray(body) ? body : body.data;
  return voices.map((voice) => ({
    voiceId: voice.id,
    name: voice.name,
    description: [voice.language, voice.description].filter(Boolean).join(' · '),
  }));
}

function listVoices(provider: VoiceProvider, env: ApiEnv): Promise<ListedVoice[]> {
  return provider === 'elevenlabs' ? listElevenLabsVoices(env) : listCartesiaVoices(env);
}

async function speakDemoLines(provider: VoiceProvider, voiceId: string): Promise<void> {
  const env = createProviderEnv(provider, [voiceId]);
  const speechSynthesisClient = createSpeechSynthesisClient({ env, logger: { debug: () => {} } });
  if (speechSynthesisClient === null) {
    return;
  }
  console.log(`\n${provider} · voice ${voiceId}`);
  for (const [lineIndex, line] of DEMO_LINES.entries()) {
    const requestStartedAtMilliseconds = performance.now();
    let timeToFirstAudioMilliseconds: number | null = null;
    const chunks: Uint8Array[] = [];
    try {
      for await (const audio of speechSynthesisClient.streamSpeech({
        text: line.text,
        languageCode: line.languageCode,
        voiceId,
        signal: new AbortController().signal,
      })) {
        timeToFirstAudioMilliseconds ??= Math.round(
          performance.now() - requestStartedAtMilliseconds,
        );
        chunks.push(audio);
      }
    } catch (error) {
      console.log(`  ${lineIndex + 1}. ${line.languageCode} FAILED: ${String(error)}`);
      continue;
    }
    const pcmBytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
    let byteOffset = 0;
    for (const chunk of chunks) {
      pcmBytes.set(chunk, byteOffset);
      byteOffset += chunk.length;
    }
    const filePath = join(
      options.out,
      `${provider}-${voiceId}-${lineIndex + 1}-${line.languageCode}.wav`,
    );
    writeFileSync(
      filePath,
      createWavFile({
        pcmBytes,
        sampleRateHertz: TRANSLATION_AUDIO_SAMPLE_RATE_HERTZ,
        channelCount: 1,
        bitsPerSample: BITS_PER_SAMPLE,
      }),
    );
    const audioDurationSeconds =
      pcmBytes.length / TRANSLATION_AUDIO_BYTES_PER_SAMPLE / TRANSLATION_AUDIO_SAMPLE_RATE_HERTZ;
    console.log(
      `  ${lineIndex + 1}. ${line.languageCode}  first audio ${String(timeToFirstAudioMilliseconds).padStart(5)} ms` +
        `  total ${String(Math.round(performance.now() - requestStartedAtMilliseconds)).padStart(5)} ms` +
        `  (${audioDurationSeconds.toFixed(1)} s of speech)  listen for: ${line.whatToListenFor}`,
    );
  }
}

const providers = findConfiguredProviders();
if (providers.length === 0) {
  console.error(
    'No voice API key found. Add ELEVENLABS_API_KEY and/or CARTESIA_API_KEY to apps/api/.env.',
  );
  process.exit(1);
}
mkdirSync(options.out, { recursive: true });

for (const provider of providers) {
  const listedVoices = await listVoices(provider, createProviderEnv(provider, ['listing']));
  if (options.list) {
    console.log(`\n${provider}: ${listedVoices.length} voices`);
    for (const voice of listedVoices.slice(0, MAXIMUM_LISTED_VOICE_COUNT)) {
      console.log(`  ${voice.voiceId}  ${voice.name}  ${voice.description}`);
    }
    continue;
  }
  const voiceIds =
    options.voice.length > 0
      ? options.voice
      : listedVoices.slice(0, 1).map((voice) => voice.voiceId);
  for (const voiceId of voiceIds) {
    await speakDemoLines(provider, voiceId);
  }
}
if (!options.list) {
  console.log(`\nWAV files are in ${options.out}`);
}
