import type { ServerWebSocket } from 'bun';

/**
 * A local stand-in for Muse Voice Transcribe's realtime endpoint, speaking the protocol
 * recorded in Phase 0 (D-005, D-012). Tests script the events it sends.
 */

export type FakeMetaConnection = {
  handshake: Record<string, unknown> | null;
  receivedAudioByteCount: number;
  receivedTextMessages: unknown[];
  isClosed: boolean;
  sendEvent: (event: Record<string, unknown>) => void;
  close: (closeCode: number, reason?: string) => void;
};

type FakeMetaTranscriptionServerOptions = {
  /** Answer the handshake with an error event and a 1008 close, as Meta does for a bad key. */
  isHandshakeRejected?: boolean;
  /** On `endStream`, complete the open turn with this transcript, then close. */
  transcriptOnEndStream?: string;
};

type SocketData = { connection: FakeMetaConnection };

const POLICY_VIOLATION_CLOSE_CODE = 1008;
const NORMAL_CLOSE_CODE = 1000;

export function startFakeMetaTranscriptionServer(options: FakeMetaTranscriptionServerOptions = {}) {
  const connections: FakeMetaConnection[] = [];

  function handleTextMessage(socket: ServerWebSocket<SocketData>, messageText: string): void {
    const { connection } = socket.data;
    const message = JSON.parse(messageText) as Record<string, unknown>;

    if (connection.handshake === null) {
      connection.handshake = message;
      if (options.isHandshakeRejected) {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid API key', sessionId: '' }));
        socket.close(POLICY_VIOLATION_CLOSE_CODE, 'invalid request');
        return;
      }
      socket.send(JSON.stringify({ sessionId: `fake/${connections.length}` }));
      return;
    }

    connection.receivedTextMessages.push(message);
    if (message.type === 'endStream') {
      if (options.transcriptOnEndStream !== undefined) {
        const audioProcessedMs = 1000;
        socket.send(JSON.stringify({ type: 'speechEnd', turnId: 0, audioProcessedMs }));
        socket.send(
          JSON.stringify({
            type: 'speechComplete',
            turnId: 0,
            transcript: options.transcriptOnEndStream,
            audioProcessedMs,
          }),
        );
      }
      socket.close(NORMAL_CLOSE_CODE);
    }
  }

  const server = Bun.serve<SocketData>({
    port: 0,
    fetch(request, bunServer) {
      const connection: FakeMetaConnection = {
        handshake: null,
        receivedAudioByteCount: 0,
        receivedTextMessages: [],
        isClosed: false,
        sendEvent: () => {},
        close: () => {},
      };
      const isUpgraded = bunServer.upgrade(request, { data: { connection } });
      return isUpgraded ? undefined : new Response('WebSocket only', { status: 400 });
    },
    websocket: {
      open(socket) {
        const { connection } = socket.data;
        connection.sendEvent = (event) => socket.send(JSON.stringify(event));
        connection.close = (closeCode, reason) => socket.close(closeCode, reason);
        connections.push(connection);
      },
      message(socket, message) {
        if (typeof message === 'string') {
          handleTextMessage(socket, message);
        } else {
          socket.data.connection.receivedAudioByteCount += message.byteLength;
        }
      },
      close(socket) {
        socket.data.connection.isClosed = true;
      },
    },
  });

  return {
    url: `ws://127.0.0.1:${server.port}`,
    connections,
    stop: () => server.stop(true),
  };
}

export type FakeMetaTranscriptionServer = ReturnType<typeof startFakeMetaTranscriptionServer>;
