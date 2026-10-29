import type { FastifyBaseLogger } from 'fastify';
import { parseServerSentEvents } from '../lib/parse-server-sent-events';

const STREAM_DONE_MARKER = '[DONE]';
// Muse Spark always reasons; "minimal" is the least it allows and measured fastest (D-014).
const REASONING_EFFORT = 'minimal';
export const TRANSLATION_TIMEOUT_MILLISECONDS = 10_000;

type ChatCompletionChunk = {
  choices?: { delta?: { content?: string | null } }[];
};

type MetaTranslationClientOptions = {
  chatCompletionsUrl: string;
  modelId: string;
  metaApiKey: string;
  logger: FastifyBaseLogger;
  /** Tests shorten it. */
  timeoutMilliseconds?: number;
};

type StreamTranslationInput = {
  systemPrompt: string;
  utteranceText: string;
  /** Aborts the request, for example when the browser disconnects. */
  signal: AbortSignal;
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
}: MetaTranslationClientOptions) {
  const authorizationHeaders = { Authorization: `Bearer ${metaApiKey}` };

  return {
    /** Yields the translation's text as it arrives. Throws `TranslationFailedError`. */
    async *streamTranslation({
      systemPrompt,
      utteranceText,
      signal,
    }: StreamTranslationInput): AsyncGenerator<string> {
      const timeoutSignal = AbortSignal.timeout(timeoutMilliseconds);
      let response: Response;
      try {
        response = await fetch(chatCompletionsUrl, {
          method: 'POST',
          headers: { ...authorizationHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelId,
            stream: true,
            reasoning_effort: REASONING_EFFORT,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: utteranceText },
            ],
          }),
          signal: AbortSignal.any([signal, timeoutSignal]),
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
    },

    /**
     * Opens the HTTPS connection before the first utterance needs it, so that utterance
     * doesn't pay for the TLS handshake. `fetch` keeps the connection for reuse (D-014).
     */
    warmConnection(): void {
      fetch(new URL('/v1/models', chatCompletionsUrl), { headers: authorizationHeaders })
        .then((response) => response.body?.cancel())
        .catch((error: unknown) => logger.debug({ err: error }, 'translation warm-up failed'));
    },
  };
}

export type MetaTranslationClient = ReturnType<typeof createMetaTranslationClient>;
