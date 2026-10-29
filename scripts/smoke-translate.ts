/**
 * Phase 0 API check for Muse Spark (D-006). Sends one Hindi sentence to Chat Completions with
 * `stream: true` and prints every delta with its arrival time.
 *
 *   bun run smoke:translate
 *   bun run smoke:translate --model muse-spark-1.2 --reasoning-effort low --text "..."
 */
import { parseArgs } from 'node:util';
import { parseServerSentEvents } from '../apps/api/src/lib/parse-server-sent-events';
import {
  DEFAULT_TRANSLATION_MODEL_ID,
  META_CHAT_COMPLETIONS_URL,
  readMetaApiKeyOrExit,
} from './lib/meta-model-api';

const DEFAULT_HINDI_TEXT =
  'नमस्ते, हमारे पास जयपुर की नीली मिट्टी के दो सौ फूलदान तैयार हैं, और डिलीवरी दो हफ़्ते में हो जाएगी।';
// Muse Spark always reasons ("none" is rejected), so ask for the least reasoning (D-011).
const DEFAULT_REASONING_EFFORT = 'minimal';
const STREAM_DONE_MARKER = '[DONE]';

type ChatCompletionChunk = {
  choices?: { delta?: Record<string, unknown>; finish_reason?: string | null }[];
  usage?: unknown;
};

const { values: options } = parseArgs({
  options: {
    model: { type: 'string', default: DEFAULT_TRANSLATION_MODEL_ID },
    'reasoning-effort': { type: 'string', default: DEFAULT_REASONING_EFFORT },
    text: { type: 'string', default: DEFAULT_HINDI_TEXT },
  },
});

function formatElapsed(requestStartedAtMilliseconds: number): string {
  return `+${Math.round(performance.now() - requestStartedAtMilliseconds)
    .toString()
    .padStart(5)} ms`;
}

const metaApiKey = readMetaApiKeyOrExit();

console.log(`model:            ${options.model}`);
console.log(`reasoning_effort: ${options['reasoning-effort']}`);
console.log(`text:             ${options.text}\n`);

const requestStartedAtMilliseconds = performance.now();
const response = await fetch(META_CHAT_COMPLETIONS_URL, {
  method: 'POST',
  headers: { Authorization: `Bearer ${metaApiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: options.model,
    stream: true,
    reasoning_effort: options['reasoning-effort'],
    messages: [
      {
        role: 'system',
        content:
          'You are a live interpreter. Translate the Hindi the user says into natural spoken ' +
          'English. Reply with the translation only.',
      },
      { role: 'user', content: options.text },
    ],
  }),
});

console.log(`${formatElapsed(requestStartedAtMilliseconds)}  HTTP ${response.status}`);
console.log(`           content-type: ${response.headers.get('content-type')}`);
if (!response.ok || response.body === null) {
  console.error(await response.text());
  process.exit(1);
}

const textDecoder = new TextDecoder();
const deltaFieldNamesSeen = new Set<string>();
let bufferedText = '';
let translation = '';
let firstContentElapsedMilliseconds: number | null = null;
let isFirstChunkPrinted = false;

for await (const networkChunk of response.body) {
  bufferedText += textDecoder.decode(networkChunk, { stream: true });
  const { dataPayloads, remainingText } = parseServerSentEvents(bufferedText);
  bufferedText = remainingText;

  for (const dataPayload of dataPayloads) {
    if (dataPayload === STREAM_DONE_MARKER) {
      console.log(`${formatElapsed(requestStartedAtMilliseconds)}  [DONE]`);
      continue;
    }

    const chunk = JSON.parse(dataPayload) as ChatCompletionChunk;
    if (!isFirstChunkPrinted) {
      console.log(`           first chunk, raw: ${dataPayload}`);
      isFirstChunkPrinted = true;
    }

    const choice = chunk.choices?.[0];
    for (const fieldName of Object.keys(choice?.delta ?? {})) {
      deltaFieldNamesSeen.add(fieldName);
    }

    const content = choice?.delta?.content;
    if (typeof content === 'string' && content.length > 0) {
      firstContentElapsedMilliseconds ??= performance.now() - requestStartedAtMilliseconds;
      translation += content;
      console.log(
        `${formatElapsed(requestStartedAtMilliseconds)}  delta ${JSON.stringify(content)}`,
      );
    }
    if (choice?.finish_reason) {
      console.log(
        `${formatElapsed(requestStartedAtMilliseconds)}  finish_reason ${choice.finish_reason}`,
      );
    }
    if (chunk.usage) {
      console.log(`           usage: ${JSON.stringify(chunk.usage)}`);
    }
  }
}

const totalElapsedMilliseconds = performance.now() - requestStartedAtMilliseconds;
console.log('\n── summary ──');
console.log(`translation:           ${translation}`);
console.log(
  `time to first content: ${firstContentElapsedMilliseconds === null ? 'none' : `${Math.round(firstContentElapsedMilliseconds)} ms`}`,
);
console.log(`total time:            ${Math.round(totalElapsedMilliseconds)} ms`);
console.log(`delta fields seen:     ${[...deltaFieldNamesSeen].join(', ') || 'none'}`);
