import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createConversationConnection } from '../handlers/conversation-connection';
import { handleAudioFrame } from '../handlers/handle-audio-frame';
import { handleClientMessage } from '../handlers/handle-client-message';
import { closeAllTranscriptions } from '../handlers/transcription-lifecycle';
import { isAllowedOrigin } from '../lib/is-allowed-origin';

const POLICY_VIOLATION_CLOSE_CODE = 1008;
const textDecoder = new TextDecoder();

type RawSocketData = Buffer | ArrayBuffer | Buffer[];

function toUint8Array(data: RawSocketData): Uint8Array {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return data instanceof ArrayBuffer ? new Uint8Array(data) : data;
}

export async function conversationSocketRoutes(server: FastifyInstance) {
  server.get('/v1/conversation', { websocket: true }, (socket, request) => {
    if (!isAllowedOrigin(request.headers.origin, server.env.ALLOWED_WEB_ORIGINS)) {
      request.log.warn({ origin: request.headers.origin }, 'conversation socket origin rejected');
      socket.close(POLICY_VIOLATION_CLOSE_CODE, 'Origin not allowed');
      return;
    }

    const connection = createConversationConnection({
      participantId: randomUUID(),
      env: server.env,
      logger: request.log,
      sendServerMessage(message) {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(message));
        }
      },
    });

    socket.on('message', (data: RawSocketData, isBinary: boolean) => {
      if (isBinary) {
        handleAudioFrame(connection, toUint8Array(data));
      } else {
        handleClientMessage(connection, textDecoder.decode(toUint8Array(data)));
      }
    });

    socket.on('close', () => {
      closeAllTranscriptions(connection);
    });
  });
}
