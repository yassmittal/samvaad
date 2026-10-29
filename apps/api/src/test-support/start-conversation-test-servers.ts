import { buildServer } from '../build-server';
import { parseApiEnv } from '../plugins/env';
import {
  type FakeMetaConnection,
  startFakeMetaTranscriptionServer,
} from './fake-meta-transcription-server';
import { type ScriptedTranslation, startFakeMuseSparkServer } from './fake-muse-spark-server';
import { connectTestBrowserClient } from './test-browser-client';
import { waitForCondition } from './wait-for-condition';

type ConversationTestServersOptions = {
  transcription?: Parameters<typeof startFakeMetaTranscriptionServer>[0];
  createScriptedTranslation?: (
    requestBody: Record<string, unknown>,
    requestIndex: number,
  ) => ScriptedTranslation;
};

const DEFAULT_SCRIPTED_TRANSLATION: ScriptedTranslation = { chunks: ['en\n', 'Translated.'] };

/** The API wired to both fake Meta servers, plus a browser connected to it (D-012). */
export async function startConversationTestServers(options: ConversationTestServersOptions = {}) {
  const fakeMetaServer = startFakeMetaTranscriptionServer(options.transcription);
  const fakeMuseSparkServer = startFakeMuseSparkServer({
    createScriptedTranslation:
      options.createScriptedTranslation ?? (() => DEFAULT_SCRIPTED_TRANSLATION),
  });
  const env = parseApiEnv({
    META_API_KEY: 'test-key',
    META_TRANSCRIPTION_URL: fakeMetaServer.url,
    META_CHAT_COMPLETIONS_URL: fakeMuseSparkServer.chatCompletionsUrl,
  });
  const server = await buildServer({ env, isLoggingEnabled: false });
  const httpUrl = await server.listen({ port: 0, host: '127.0.0.1' });
  const browser = await connectTestBrowserClient(
    `${httpUrl.replace('http', 'ws')}/v1/conversation`,
  );

  return {
    fakeMetaServer,
    fakeMuseSparkServer,
    browser,

    /** Starts a Hindi–English table session and opens the mic; returns Meta's side of it. */
    async startTableSessionWithMicrophoneOpen(): Promise<FakeMetaConnection> {
      browser.sendJson({ type: 'start_table_session', languageCodes: ['hi', 'en'] });
      await browser.waitForMessage('session_ready');
      browser.sendJson({ type: 'microphone_state', isOpen: true });
      await waitForCondition(() => fakeMetaServer.connections[0]?.handshake != null, 'a handshake');
      return fakeMetaServer.connections[0] as FakeMetaConnection;
    },

    async stop(): Promise<void> {
      browser.socket.close();
      await server.close();
      fakeMetaServer.stop();
      fakeMuseSparkServer.stop();
    },
  };
}

export type ConversationTestServers = Awaited<ReturnType<typeof startConversationTestServers>>;

/** Makes the fake transcriber finish one utterance, as Meta does at a pause (D-005). */
export function sendFinishedUtterance(
  metaConnection: FakeMetaConnection,
  { turnId, transcript }: { turnId: number; transcript: string },
): void {
  metaConnection.sendEvent({ type: 'speechStart', turnId, audioProcessedMs: 0 });
  metaConnection.sendEvent({ type: 'speechEnd', turnId, audioProcessedMs: 0 });
  metaConnection.sendEvent({ type: 'speechComplete', turnId, transcript, audioProcessedMs: 0 });
}
