import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './build-server';
import { parseApiEnv } from './plugins/env';

const ALLOWED_WEB_ORIGIN = 'http://localhost:3400';
const POLICY_VIOLATION_CLOSE_CODE = 1008;

let server: FastifyInstance;
let conversationSocketUrl: string;

beforeEach(async () => {
  const env = parseApiEnv({ META_API_KEY: 'test-key', ALLOWED_WEB_ORIGINS: ALLOWED_WEB_ORIGIN });
  server = await buildServer({ env, isLoggingEnabled: false });
  // A real listening server: `injectWS` relies on the `ws` package internals, which Bun replaces.
  const httpUrl = await server.listen({ port: 0, host: '127.0.0.1' });
  conversationSocketUrl = `${httpUrl.replace('http', 'ws')}/v1/conversation`;
});

afterEach(async () => {
  await server.close();
});

function openConversationSocket(headers: Record<string, string> = {}): Promise<WebSocket> {
  const socket = new WebSocket(conversationSocketUrl, { headers });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

function waitForNextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    socket.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))), {
      once: true,
    });
  });
}

function waitForClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    socket.addEventListener('close', (event) => resolve(event.code), { once: true });
  });
}

describe('GET /health', () => {
  test('answers ok', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  test('allows the web app origin through CORS', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: ALLOWED_WEB_ORIGIN },
    });

    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_WEB_ORIGIN);
  });
});

describe('GET /v1/conversation (WebSocket)', () => {
  test('echoes a JSON message', async () => {
    const socket = await openConversationSocket();
    const message = { type: 'ping', sentAtEpochMilliseconds: 1_761_700_000_000 };

    const reply = waitForNextMessage(socket);
    socket.send(JSON.stringify(message));

    expect(await reply).toEqual(message);
    socket.close();
  });

  test('answers a message that is not JSON with INVALID_MESSAGE', async () => {
    const socket = await openConversationSocket();

    const reply = waitForNextMessage(socket);
    socket.send('not json');

    expect(await reply).toMatchObject({ type: 'error', code: 'INVALID_MESSAGE' });
    socket.close();
  });

  test('closes the socket for an origin that is not allowed', async () => {
    const socket = await openConversationSocket({ origin: 'https://somewhere-else.example' });

    expect(await waitForClose(socket)).toBe(POLICY_VIOLATION_CLOSE_CODE);
  });
});
