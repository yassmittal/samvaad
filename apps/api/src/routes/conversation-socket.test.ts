import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../build-server';
import { parseApiEnv } from '../plugins/env';
import {
  type FakeMetaTranscriptionServer,
  startFakeMetaTranscriptionServer,
} from '../test-support/fake-meta-transcription-server';
import {
  connectTestBrowserClient,
  type TestBrowserClient,
} from '../test-support/test-browser-client';
import { waitForCondition } from '../test-support/wait-for-condition';

const AUDIO_FRAME_BYTE_COUNT = 2560;

let fakeMetaServer: FakeMetaTranscriptionServer;
let server: FastifyInstance;
let browser: TestBrowserClient;

async function startServers(
  fakeServerOptions: Parameters<typeof startFakeMetaTranscriptionServer>[0] = {},
) {
  fakeMetaServer = startFakeMetaTranscriptionServer(fakeServerOptions);
  const env = parseApiEnv({
    META_API_KEY: 'test-key',
    META_TRANSCRIPTION_URL: fakeMetaServer.url,
  });
  server = await buildServer({ env, isLoggingEnabled: false });
  const httpUrl = await server.listen({ port: 0, host: '127.0.0.1' });
  browser = await connectTestBrowserClient(`${httpUrl.replace('http', 'ws')}/v1/conversation`);
}

async function startTableSessionWithMicrophoneOpen() {
  browser.sendJson({ type: 'start_table_session', languageCodes: ['hi', 'en'] });
  await browser.waitForMessage('session_ready');
  browser.sendJson({ type: 'microphone_state', isOpen: true });
  await waitForCondition(() => fakeMetaServer.connections[0]?.handshake != null, 'a handshake');
  return fakeMetaServer.connections[0] as NonNullable<(typeof fakeMetaServer.connections)[0]>;
}

afterEach(async () => {
  browser.socket.close();
  await server.close();
  fakeMetaServer.stop();
});

describe('conversation socket, table mode', () => {
  beforeEach(() => startServers());

  test('answers start_table_session with session_ready', async () => {
    browser.sendJson({ type: 'start_table_session', languageCodes: ['hi', 'en'] });

    const sessionReady = await browser.waitForMessage('session_ready');
    expect(sessionReady.languageCodes).toEqual(['hi', 'en']);
    expect(sessionReady.participantId).toBeString();
  });

  test('opens the transcription stream with the verified handshake', async () => {
    const metaConnection = await startTableSessionWithMicrophoneOpen();

    expect(metaConnection.handshake).toEqual({
      authorization: { accessToken: 'Bearer test-key' },
      model: 'muse-voice-transcribe-1.0',
      audioEncoding: 'PCM_16KHZ',
      mode: 'ENDPOINTING',
      languageBias: ['Hindi', 'English'],
      emitAudioProgress: false,
    });
  });

  test('forwards audio frames to Meta, including ones sent before the handshake finished', async () => {
    browser.sendJson({ type: 'start_table_session', languageCodes: ['hi', 'en'] });
    browser.sendJson({ type: 'microphone_state', isOpen: true });
    browser.sendAudioFrame(new Uint8Array(AUDIO_FRAME_BYTE_COUNT));
    browser.sendAudioFrame(new Uint8Array(AUDIO_FRAME_BYTE_COUNT));
    browser.sendAudioFrame(new Uint8Array(AUDIO_FRAME_BYTE_COUNT));

    await waitForCondition(
      () => fakeMetaServer.connections[0]?.receivedAudioByteCount === 3 * AUDIO_FRAME_BYTE_COUNT,
      'three frames at the fake Meta server',
    );
  });

  test('turns Meta partials and the final transcript into one utterance', async () => {
    const metaConnection = await startTableSessionWithMicrophoneOpen();
    browser.sendAudioFrame(new Uint8Array(AUDIO_FRAME_BYTE_COUNT));

    metaConnection.sendEvent({ type: 'speechStart', turnId: 0, audioProcessedMs: 0 });
    metaConnection.sendEvent({
      type: 'transcript',
      transcript: 'नमस्ते',
      final: false,
      audioProcessedMs: 40,
    });
    const partial = await browser.waitForMessage('transcript_partial');
    expect(partial.text).toBe('नमस्ते');

    const millisecondsBeforeSpeechEnd = Date.now();
    metaConnection.sendEvent({ type: 'speechEnd', turnId: 0, audioProcessedMs: 80 });
    metaConnection.sendEvent({
      type: 'speechComplete',
      turnId: 0,
      transcript: 'नमस्ते।',
      audioProcessedMs: 80,
    });
    const final = await browser.waitForMessage('transcript_final');

    expect(final.utteranceId).toBe(partial.utteranceId);
    expect(final.text).toBe('नमस्ते।');
    expect(final.languageCode).toBeNull();
    expect(final.speechEndedAtEpochMilliseconds).toBeLessThanOrEqual(millisecondsBeforeSpeechEnd);
  });

  test('gives each turn its own utterance id, even when a final arrives after the next start', async () => {
    const metaConnection = await startTableSessionWithMicrophoneOpen();

    metaConnection.sendEvent({ type: 'speechStart', turnId: 0, audioProcessedMs: 0 });
    metaConnection.sendEvent({
      type: 'transcript',
      transcript: 'one',
      final: false,
      audioProcessedMs: 10,
    });
    const firstPartial = await browser.waitForMessage('transcript_partial');
    metaConnection.sendEvent({ type: 'speechStart', turnId: 1, audioProcessedMs: 20 });
    metaConnection.sendEvent({
      type: 'speechComplete',
      turnId: 0,
      transcript: 'One.',
      audioProcessedMs: 20,
    });
    metaConnection.sendEvent({
      type: 'transcript',
      transcript: 'two',
      final: false,
      audioProcessedMs: 30,
    });

    const firstFinal = await browser.waitForMessage('transcript_final');
    const secondPartial = await browser.waitForMessage('transcript_partial');
    expect(firstFinal.utteranceId).toBe(firstPartial.utteranceId);
    expect(secondPartial.utteranceId).not.toBe(firstPartial.utteranceId);
  });

  test('closing the microphone sends endStream to Meta', async () => {
    const metaConnection = await startTableSessionWithMicrophoneOpen();

    browser.sendJson({ type: 'microphone_state', isOpen: false });

    await waitForCondition(
      () =>
        metaConnection.receivedTextMessages.some(
          (message) => (message as { type?: string }).type === 'endStream',
        ),
      'endStream at the fake Meta server',
    );
  });

  test('closing the browser socket closes the upstream socket', async () => {
    const metaConnection = await startTableSessionWithMicrophoneOpen();

    browser.socket.close();

    await waitForCondition(() => metaConnection.isClosed, 'the upstream socket to close');
  });

  test('audio before the microphone opens is answered once with MICROPHONE_NOT_OPEN', async () => {
    browser.sendAudioFrame(new Uint8Array(AUDIO_FRAME_BYTE_COUNT));
    browser.sendAudioFrame(new Uint8Array(AUDIO_FRAME_BYTE_COUNT));

    const error = await browser.waitForMessage('error');
    expect(error.code).toBe('MICROPHONE_NOT_OPEN');
    await Bun.sleep(50);
    expect(browser.receivedMessages.filter((message) => message.type === 'error')).toHaveLength(0);
  });

  test('opening the microphone before a session is INVALID_MESSAGE', async () => {
    browser.sendJson({ type: 'microphone_state', isOpen: true });

    expect((await browser.waitForMessage('error')).code).toBe('INVALID_MESSAGE');
  });

  test('a message that is not JSON is INVALID_MESSAGE', async () => {
    browser.sendText('not json');

    expect((await browser.waitForMessage('error')).code).toBe('INVALID_MESSAGE');
  });

  test('an unknown message type is INVALID_MESSAGE', async () => {
    browser.sendJson({ type: 'dance' });

    expect((await browser.waitForMessage('error')).code).toBe('INVALID_MESSAGE');
  });

  test('an unsupported language is UNSUPPORTED_LANGUAGE', async () => {
    browser.sendJson({ type: 'start_table_session', languageCodes: ['hi', 'xx'] });

    expect((await browser.waitForMessage('error')).code).toBe('UNSUPPORTED_LANGUAGE');
  });
});

describe('conversation socket, when Meta finishes the utterance on endStream', () => {
  beforeEach(() => startServers({ transcriptOnEndStream: 'Hello there.' }));

  test('the final transcript still reaches the browser after the microphone closes', async () => {
    await startTableSessionWithMicrophoneOpen();
    browser.sendAudioFrame(new Uint8Array(AUDIO_FRAME_BYTE_COUNT));

    browser.sendJson({ type: 'microphone_state', isOpen: false });

    expect((await browser.waitForMessage('transcript_final')).text).toBe('Hello there.');
  });
});

describe('conversation socket, when Meta rejects the handshake', () => {
  beforeEach(() => startServers({ isHandshakeRejected: true }));

  test('the browser gets UPSTREAM_UNAVAILABLE', async () => {
    browser.sendJson({ type: 'start_table_session', languageCodes: ['hi', 'en'] });
    browser.sendJson({ type: 'microphone_state', isOpen: true });

    expect((await browser.waitForMessage('error')).code).toBe('UPSTREAM_UNAVAILABLE');
  });
});
