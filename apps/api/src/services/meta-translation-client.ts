import type { FastifyBaseLogger } from 'fastify';
import { parseServerSentEvents } from '../lib/parse-server-sent-events';
import { raceTextStreams } from '../lib/race-text-streams';

const STREAM_DONE_MARKER = '[DONE]';
// Muse Spark always reasons; "minimal" is the least it allows and measured fastest (D-014).
const TRANSLATION_REASONING_EFFORT = 'minimal';
// Nobody is waiting word by word for a recap, and it has a whole conversation to weigh (D-016).
const RECAP_REASONING_EFFORT = 'low';
export const TRANSLATION_TIMEOUT_MILLISECONDS = 10_000;
export const RECAP_TIMEOUT_MILLISECONDS = 45_000;

type ChatCompletionChunk = {
  choices?: { delta?: { content?: string | null } }[];
};

type ReasoningEffort = typeof TRANSLATION_REASONING_EFFORT | typeof RECAP_REASONING_EFFORT;

type MetaTranslationClientOptions = {
  chatCompletionsUrl: string;
  modelId: string;
  metaApiKey: string;
  /** Only the warm-up logs, so the comparison script can pass a stand-in. */
  logger: Pick<FastifyBaseLogger, 'debug'>;
  /** Tests shorten them. */
  timeoutMilliseconds?: number;
  recapTimeoutMilliseconds?: number;
  /** Identical translation requests raced against each other; the first to answer wins (D-020). */
  parallelRequestCount?: number;
};

type StreamTranslationInput = {
  systemPrompt: string;
  utteranceText: string;
  /** Aborts the request, for example when the browser disconnects. */
  signal: AbortSignal;
};

type WriteRecapInput = {
  systemPrompt: string;
  conversationText: string;
};

type ChatCompletionInput = {
  systemPrompt: string;
  userText: string;
  reasoningEffort: ReasoningEffort;
  /** Cancels the request early; the timeout applies either way. */
  signal?: AbortSignal;
  timeoutMilliseconds: number;
};

export class TranslationFailedError extends Error {
  override name = 'TranslationFailedError';
}

/** Muse Spark Chat Completions, streamed (D-006). Only this file talks to it. */
export function createMetaTranslationClient({
  chatCompletionsUrl,
  modelId,
  metaApiKey,
  logger,
  timeoutMilliseconds = TRANSLATION_TIMEOUT_MILLISECONDS,
  recapTimeoutMilliseconds = RECAP_TIMEOUT_MILLISECONDS,
  parallelRequestCount = 1,
}: MetaTranslationClientOptions) {
  const authorizationHeaders = { Authorization: `Bearer ${metaApiKey}` };

  /** Yields the answer's text as it arrives. Throws `TranslationFailedError`. */
  async function* streamChatCompletion({
    systemPrompt,
    userText,
    reasoningEffort,
    signal,
    timeoutMilliseconds: requestTimeoutMilliseconds,
  }: ChatCompletionInput): AsyncGenerator<string> {
    const timeoutSignal = AbortSignal.timeout(requestTimeoutMilliseconds);
    let response: Response;
    try {
      response = await fetch(chatCompletionsUrl, {
        method: 'POST',
        headers: { ...authorizationHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          stream: true,
          reasoning_effort: reasoningEffort,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
        }),
        signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
      });
    } catch (error) {
      throw new TranslationFailedError(`request failed: ${String(error)}`);
    }

    if (!response.ok || response.body === null) {
      const responseText = await response.text().catch(() => '');
      throw new TranslationFailedError(`HTTP ${response.status}: ${responseText.slice(0, 300)}`);
    }

    const textDecoder = new TextDecoder();
    let bufferedText = '';
    try {
      for await (const networkChunk of response.body) {
        bufferedText += textDecoder.decode(networkChunk, { stream: true });
        const { dataPayloads, remainingText } = parseServerSentEvents(bufferedText);
        bufferedText = remainingText;

        for (const dataPayload of dataPayloads) {
          if (dataPayload === STREAM_DONE_MARKER) {
            return;
          }
          const chunk = JSON.parse(dataPayload) as ChatCompletionChunk;
          // The final chunks carry `finish_reason` and `usage` with null or no content.
          const content = chunk.choices?.[0]?.delta?.content;
          if (typeof content === 'string' && content.length > 0) {
            yield content;
          }
        }
      }
    } catch (error) {
      throw new TranslationFailedError(`stream broke: ${String(error)}`);
    }
  }

  return {
    parallelRequestCount,

    /**
     * Yields the translation's text as it arrives, from whichever of `parallelRequestCount`
     * identical requests answers first (D-020). Throws `TranslationFailedError`.
     */
    streamTranslation({
      systemPrompt,
      utteranceText,
      signal,
    }: StreamTranslationInput): AsyncGenerator<string> {
      return raceTextStreams({
        startTextStream: (requestSignal) =>
          streamChatCompletion({
            systemPrompt,
            userText: utteranceText,
            reasoningEffort: TRANSLATION_REASONING_EFFORT,
            signal: requestSignal,
            timeoutMilliseconds,
          }),
        streamCount: parallelRequestCount,
        signal,
      });
    },

    /** The whole recap at once (D-016). Throws `TranslationFailedError`. */
    async writeRecap({ systemPrompt, conversationText }: WriteRecapInput): Promise<string> {
      let recapText = '';
      for await (const textDelta of streamChatCompletion({
        systemPrompt,
        userText: conversationText,
        reasoningEffort: RECAP_REASONING_EFFORT,
        timeoutMilliseconds: recapTimeoutMilliseconds,
      })) {
        recapText += textDelta;
      }
      return recapText.trim();
    },

    /**
     * Opens the HTTPS connections before the first utterance needs them, so that utterance
     * doesn't pay for the TLS handshake. `fetch` keeps each connection for reuse (D-014). One
     * per raced request: the race's second request would otherwise start cold (D-020).
     */
    warmConnection(): void {
      for (let requestIndex = 0; requestIndex < parallelRequestCount; requestIndex += 1) {
        fetch(new URL('/v1/models', chatCompletionsUrl), { headers: authorizationHeaders })
          .then((response) => response.body?.cancel())
          .catch((error: unknown) => logger.debug({ err: error }, 'translation warm-up failed'));
      }
    },
  };
}

export type MetaTranslationClient = ReturnType<typeof createMetaTranslationClient>;
