/**
 * A local stand-in for the voice APIs (D-021, D-012): ElevenLabs' streaming endpoint and
 * Cartesia's bytes endpoint, answering with scripted PCM chunks.
 */

export type ScriptedSpeech = {
  /** Each becomes one network chunk of raw bytes. */
  chunks: number[][];
  delayBeforeFirstChunkMilliseconds?: number;
  /** Answer with this HTTP status and no audio. */
  failureStatus?: number;
};

export type ReceivedSpeechRequest = {
  path: string;
  searchParams: URLSearchParams;
  headers: Headers;
  body: Record<string, unknown>;
};

const SPEECH_PATH_PATTERN = /^\/v1\/text-to-speech\/[^/]+\/stream$|^\/tts\/bytes$/;

export function startFakeSpeechServer({
  createScriptedSpeech,
}: {
  createScriptedSpeech: (request: ReceivedSpeechRequest, requestIndex: number) => ScriptedSpeech;
}) {
  const receivedRequests: ReceivedSpeechRequest[] = [];

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method !== 'POST' || !SPEECH_PATH_PATTERN.test(url.pathname)) {
        // The warm-up's GET of the base URL lands here, as on the real hosts.
        return new Response('ok');
      }
      const receivedRequest: ReceivedSpeechRequest = {
        path: url.pathname,
        searchParams: url.searchParams,
        headers: request.headers,
        body: (await request.json()) as Record<string, unknown>,
      };
      receivedRequests.push(receivedRequest);
      const script = createScriptedSpeech(receivedRequest, receivedRequests.length - 1);
      if (script.failureStatus !== undefined) {
        return new Response('{"error":"scripted failure"}', { status: script.failureStatus });
      }
      const stream = new ReadableStream({
        async start(controller) {
          await Bun.sleep(script.delayBeforeFirstChunkMilliseconds ?? 0);
          for (const chunk of script.chunks) {
            controller.enqueue(new Uint8Array(chunk));
            await Bun.sleep(1);
          }
          controller.close();
        },
      });
      return new Response(stream, { headers: { 'Content-Type': 'application/octet-stream' } });
    },
  });

  return {
    apiBaseUrl: `http://127.0.0.1:${server.port}`,
    receivedRequests,
    stop: () => server.stop(true),
  };
}

export type FakeSpeechServer = ReturnType<typeof startFakeSpeechServer>;
