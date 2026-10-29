import { afterEach, describe, expect, test } from 'bun:test';
import type { ServerMessage } from '@samvaad/shared';
import {
  type ConversationTestServers,
  sendFinishedUtterance,
  startConversationTestServers,
} from '../test-support/start-conversation-test-servers';
import { waitForCondition } from '../test-support/wait-for-condition';

let servers: ConversationTestServers;

afterEach(() => servers.stop());

function findTranslationMessages(messages: ServerMessage[]) {
  return messages.filter(
    (message) =>
      message.type === 'translation_delta' ||
      message.type === 'translation_complete' ||
      message.type === 'error',
  );
}

describe('translation of finished utterances (table mode)', () => {
  test('streams the translation, then completes it with the target language and timings', async () => {
    servers = await startConversationTestServers({
      createScriptedTranslation: () => ({ chunks: ['en', '\nHello, ', 'friend.'] }),
    });
    const metaConnection = await servers.startTableSessionWithMicrophoneOpen();

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'नमस्ते, दोस्त।' });
    const transcriptFinal = await servers.browser.waitForMessage('transcript_final');
    const firstDelta = await servers.browser.waitForMessage('translation_delta');
    const translationComplete = await servers.browser.waitForMessage('translation_complete');

    expect(firstDelta).toMatchObject({
      utteranceId: transcriptFinal.utteranceId,
      targetLanguageCode: 'en',
      textDelta: 'Hello, ',
    });
    expect(translationComplete.text).toBe('Hello, friend.');
    expect(translationComplete.targetLanguageCode).toBe('en');
    const { timings } = translationComplete;
    expect(timings.speechEndedAtEpochMilliseconds).toBeLessThanOrEqual(
      timings.transcriptFinalAtEpochMilliseconds,
    );
    expect(timings.transcriptFinalAtEpochMilliseconds).toBeLessThanOrEqual(
      timings.firstTranslationDeltaAtEpochMilliseconds,
    );
    expect(timings.firstTranslationDeltaAtEpochMilliseconds).toBeLessThanOrEqual(
      timings.translationCompleteAtEpochMilliseconds,
    );
  });

  test('sends the transcript with a prompt for this table’s two languages', async () => {
    servers = await startConversationTestServers();
    const metaConnection = await servers.startTableSessionWithMicrophoneOpen();

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'How are you?' });
    await servers.browser.waitForMessage('translation_complete');

    const requestBody = servers.fakeMuseSparkServer.receivedRequestBodies[0] as {
      messages: { role: string; content: string }[];
    };
    expect(requestBody.messages[0]?.content).toContain('between Hindi and English');
    expect(requestBody.messages[1]).toEqual({ role: 'user', content: 'How are you?' });
  });

  test('a later utterance never overtakes an earlier, slower one', async () => {
    servers = await startConversationTestServers({
      createScriptedTranslation: (_, requestIndex) =>
        requestIndex === 0
          ? { chunks: ['en\nFirst ', 'one.'], delayBeforeFirstChunkMilliseconds: 150 }
          : { chunks: ['hi\nदूसरा।'] },
    });
    const metaConnection = await servers.startTableSessionWithMicrophoneOpen();

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'पहला।' });
    sendFinishedUtterance(metaConnection, { turnId: 1, transcript: 'Second.' });
    await waitForCondition(
      () =>
        servers.browser.receivedMessages.filter(
          (message) => message.type === 'translation_complete',
        ).length === 2,
      'two completed translations',
    );

    const translationTexts = findTranslationMessages(servers.browser.receivedMessages).map(
      (message) => (message.type === 'translation_delta' ? message.textDelta : message.type),
    );
    expect(translationTexts).toEqual([
      'First ',
      'one.',
      'translation_complete',
      'दूसरा।',
      'translation_complete',
    ]);
  });

  test('a failed translation reports that utterance only; the next one still works', async () => {
    servers = await startConversationTestServers({
      createScriptedTranslation: (_, requestIndex) =>
        requestIndex === 0 ? { chunks: [], failureStatus: 500 } : { chunks: ['en\nWorks.'] },
    });
    const metaConnection = await servers.startTableSessionWithMicrophoneOpen();

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'पहला।' });
    const firstFinal = await servers.browser.waitForMessage('transcript_final');
    const error = await servers.browser.waitForMessage('error');
    expect(error).toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      utteranceId: firstFinal.utteranceId,
    });

    sendFinishedUtterance(metaConnection, { turnId: 1, transcript: 'दूसरा।' });
    expect((await servers.browser.waitForMessage('translation_complete')).text).toBe('Works.');
  });

  test('the phone reporting playback, twice or for an unknown utterance, gets no error', async () => {
    servers = await startConversationTestServers();
    const metaConnection = await servers.startTableSessionWithMicrophoneOpen();
    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'पहला।' });
    const { utteranceId } = await servers.browser.waitForMessage('translation_complete');

    for (const reportedUtteranceId of [utteranceId, utteranceId, 'unknown-utterance']) {
      servers.browser.sendJson({
        type: 'playback_started',
        utteranceId: reportedUtteranceId,
        startedAtEpochMilliseconds: Date.now(),
      });
    }
    sendFinishedUtterance(metaConnection, { turnId: 1, transcript: 'दूसरा।' });
    await servers.browser.waitForMessage('translation_complete');

    expect(servers.browser.receivedMessages.some((message) => message.type === 'error')).toBe(
      false,
    );
  });
});
