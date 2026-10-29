/**
 * A local stand-in for Muse Spark Chat Completions, streaming scripted SSE chunks in the
 * shape recorded in Phase 0 (D-006, D-012), with controllable delays.
 */

export type ScriptedTranslation = {
  /** Each becomes one `delta.content` chunk. */
  chunks: string[];
  delayBeforeFirstChunkMilliseconds?: number;
  delayBetweenChunksMilliseconds?: number;
  /** Answer with this HTTP status and no stream. */
  failureStatus?: number;
};

type FakeMuseSparkServerOptions = {
  createScriptedTranslation: (
    requestBody: Record<string, unknown>,
    requestIndex: number,
  ) => ScriptedTranslation;
};

function formatServerSentEvent(payload: unknown): string {
  return `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`;
}

export function startFakeMuseSparkServer({
  createScriptedTranslation,
}: FakeMuseSparkServerOptions) {
  const receivedRequestBodies: Record<string, unknown>[] = [];
  const textEncoder = new TextEncoder();

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname !== '/v1/chat/completions') {
        return new Response('not found', { status: 404 });
      }
      const requestBody = (await request.json()) as Record<string, unknown>;
      receivedRequestBodies.push(requestBody);
      const script = createScriptedTranslation(requestBody, receivedRequestBodies.length - 1);

      if (script.failureStatus !== undefined) {
        return new Response('{"error":"scripted failure"}', { status: script.failureStatus });
      }

      const stream = new ReadableStream({
        async start(controller) {
          const send = (payload: unknown) =>
            controller.enqueue(textEncoder.encode(formatServerSentEvent(payload)));
          await Bun.sleep(script.delayBeforeFirstChunkMilliseconds ?? 0);
          for (const [chunkIndex, chunk] of script.chunks.entries()) {
            if (chunkIndex > 0) {
              await Bun.sleep(script.delayBetweenChunksMilliseconds ?? 0);
            }
            send({ choices: [{ delta: { content: chunk }, finish_reason: null, index: 0 }] });
          }
          send({ choices: [{ delta: { content: null }, finish_reason: 'stop', index: 0 }] });
          send({ choices: [], usage: { completion_tokens: 1 } });
          send('[DONE]');
          controller.close();
        },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    },
  });

  return {
    chatCompletionsUrl: `http://127.0.0.1:${server.port}/v1/chat/completions`,
    receivedRequestBodies,
    stop: () => server.stop(true),
  };
}

export type FakeMuseSparkServer = ReturnType<typeof startFakeMuseSparkServer>;
