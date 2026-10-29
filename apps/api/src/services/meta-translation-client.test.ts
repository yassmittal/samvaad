import { afterEach, describe, expect, test } from 'bun:test';
import Fastify from 'fastify';
import {
  type FakeMuseSparkServer,
  type ScriptedTranslation,
  startFakeMuseSparkServer,
} from '../test-support/fake-muse-spark-server';
import { createMetaTranslationClient, TranslationFailedError } from './meta-translation-client';

const SHORT_TIMEOUT_MILLISECONDS = 100;
let fakeMuseSparkServer: FakeMuseSparkServer;

function createClientFor(script: ScriptedTranslation) {
  fakeMuseSparkServer = startFakeMuseSparkServer({ createScriptedTranslation: () => script });
  return createMetaTranslationClient({
    chatCompletionsUrl: fakeMuseSparkServer.chatCompletionsUrl,
    modelId: 'muse-spark-1.3',
    metaApiKey: 'test-key',
    logger: Fastify({ logger: false }).log,
    timeoutMilliseconds: SHORT_TIMEOUT_MILLISECONDS,
  });
}

async function collectText(textDeltas: AsyncIterable<string>): Promise<string[]> {
  const collected: string[] = [];
  for await (const textDelta of textDeltas) {
    collected.push(textDelta);
  }
  return collected;
}

const input = {
  systemPrompt: 'Translate.',
  utteranceText: 'नमस्ते',
  signal: new AbortController().signal,
};

afterEach(() => fakeMuseSparkServer.stop());

describe('createMetaTranslationClient', () => {
  test('yields each content delta and skips the null ones at the end', async () => {
    const client = createClientFor({ chunks: ['en\nHello', ', friend.'] });

    expect(await collectText(client.streamTranslation(input))).toEqual(['en\nHello', ', friend.']);
  });

  test('asks for a streamed answer with minimal reasoning', async () => {
    const client = createClientFor({ chunks: ['x'] });
    await collectText(client.streamTranslation(input));

    expect(fakeMuseSparkServer.receivedRequestBodies[0]).toMatchObject({
      model: 'muse-spark-1.3',
      stream: true,
      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: 'Translate.' },
        { role: 'user', content: 'नमस्ते' },
      ],
    });
  });

  test('an HTTP error is a TranslationFailedError', async () => {
    const client = createClientFor({ chunks: [], failureStatus: 500 });

    await expect(collectText(client.streamTranslation(input))).rejects.toBeInstanceOf(
      TranslationFailedError,
    );
  });

  test('gives up after the timeout', async () => {
    const client = createClientFor({
      chunks: ['too late'],
      delayBeforeFirstChunkMilliseconds: SHORT_TIMEOUT_MILLISECONDS * 5,
    });

    await expect(collectText(client.streamTranslation(input))).rejects.toBeInstanceOf(
      TranslationFailedError,
    );
  });
});
