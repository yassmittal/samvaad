import type { FastifyInstance } from 'fastify';
import { createEchoReply } from '../lib/create-echo-reply';
import { isAllowedOrigin } from '../lib/is-allowed-origin';

const POLICY_VIOLATION_CLOSE_CODE = 1008;

export async function conversationSocketRoutes(server: FastifyInstance) {
  server.get('/v1/conversation', { websocket: true }, (socket, request) => {
    if (!isAllowedOrigin(request.headers.origin, server.env.ALLOWED_WEB_ORIGINS)) {
      request.log.warn({ origin: request.headers.origin }, 'conversation socket origin rejected');
      socket.close(POLICY_VIOLATION_CLOSE_CODE, 'Origin not allowed');
      return;
    }

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        // Audio frames arrive from Phase 1 onwards.
        return;
      }
      socket.send(createEchoReply(data.toString()));
    });
  });
}
