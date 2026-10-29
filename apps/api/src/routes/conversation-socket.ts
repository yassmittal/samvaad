import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  type ConversationConnection,
  createConversationConnection,
} from '../handlers/conversation-connection';
import { handleAudioFrame } from '../handlers/handle-audio-frame';
import { handleClientMessage } from '../handlers/handle-client-message';
import { leaveCurrentRoom } from '../handlers/handle-leave-room';
import { isAllowedOrigin } from '../lib/is-allowed-origin';
import { createRoomRegistry } from '../rooms/room-registry';

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
  // One registry per server, so each test's server has rooms of its own.
  const roomRegistry = createRoomRegistry<ConversationConnection>();

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
      roomRegistry,
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
      leaveCurrentRoom(connection);
    });
  });
}
