import fastifyWebsocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

// An 80 ms audio frame is 2.5 KiB; nothing a browser sends should come close to this.
const MAXIMUM_MESSAGE_BYTES = 64 * 1024;

export const websocketPlugin = fastifyPlugin(
  async (server: FastifyInstance) => {
    await server.register(fastifyWebsocket, { options: { maxPayload: MAXIMUM_MESSAGE_BYTES } });
  },
  { name: 'websocket' },
);
