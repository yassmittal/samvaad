import {
  type ClientMessage,
  clientMessageSchema,
  type ServerMessage,
  serverMessageSchema,
} from '@samvaad/shared';

const CONVERSATION_SOCKET_PATH = '/v1/conversation';
// A handshake that hangs (a tunnel mid-reconnect, a stalled mobile network) never fires
// `close` on its own, so give up on it and retry.
const CONNECT_TIMEOUT_MILLISECONDS = 10_000;
const MAXIMUM_RECONNECT_ATTEMPTS = 5;
const FIRST_RECONNECT_DELAY_MILLISECONDS = 1000;

export type ConversationSocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

type ConversationSocketClientOptions = {
  apiBaseUrl: string;
  onServerMessage: (message: ServerMessage) => void;
  onStatusChange: (status: ConversationSocketStatus) => void;
};

export type ConversationSocketClient = {
  sendClientMessage: (message: ClientMessage) => void;
  sendAudioFrame: (frame: ArrayBuffer) => void;
  /** Starts over after the client gave up (status `closed`). */
  reconnect: () => void;
  close: () => void;
};

export function createConversationSocketUrl(apiBaseUrl: string): string {
  const socketUrl = new URL(CONVERSATION_SOCKET_PATH, apiBaseUrl);
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return socketUrl.toString();
}

/**
 * The only place the web app opens a WebSocket. Every message in or out is checked against
 * the shared schema. A dropped socket is retried a few times with growing delays; the API
 * forgets a connection's session when it closes, so listeners re-send it on `open`.
 */
export function createConversationSocketClient({
  apiBaseUrl,
  onServerMessage,
  onStatusChange,
}: ConversationSocketClientOptions): ConversationSocketClient {
  const socketUrl = createConversationSocketUrl(apiBaseUrl);
  let socket: WebSocket | null = null;
  let reconnectAttemptCount = 0;
  let isClosedByUs = false;

  function scheduleReconnect(): void {
    if (reconnectAttemptCount >= MAXIMUM_RECONNECT_ATTEMPTS) {
      onStatusChange('closed');
      return;
    }
    const reconnectDelayMilliseconds =
      FIRST_RECONNECT_DELAY_MILLISECONDS * 2 ** reconnectAttemptCount;
    reconnectAttemptCount += 1;
    onStatusChange('reconnecting');
    setTimeout(connect, reconnectDelayMilliseconds);
  }

  function connect(): void {
    if (isClosedByUs) {
      return;
    }
    let connectingSocket: WebSocket;
    try {
      connectingSocket = new WebSocket(socketUrl);
    } catch (error) {
      // Thrown for a malformed URL, or ws:// from an https:// page (mixed content).
      console.error('could not open the conversation socket', socketUrl, error);
      onStatusChange('closed');
      return;
    }
    socket = connectingSocket;
    connectingSocket.binaryType = 'arraybuffer';

    const connectTimeout = setTimeout(() => {
      if (connectingSocket.readyState === WebSocket.CONNECTING) {
        connectingSocket.close();
      }
    }, CONNECT_TIMEOUT_MILLISECONDS);

    connectingSocket.addEventListener('open', () => {
      clearTimeout(connectTimeout);
      reconnectAttemptCount = 0;
      onStatusChange('open');
    });

    connectingSocket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        return;
      }
      const parseResult = serverMessageSchema.safeParse(JSON.parse(event.data));
      if (parseResult.success) {
        onServerMessage(parseResult.data);
      } else {
        console.warn('ignored an invalid server message', event.data, parseResult.error.issues);
      }
    });

    connectingSocket.addEventListener('close', () => {
      clearTimeout(connectTimeout);
      if (!isClosedByUs && socket === connectingSocket) {
        scheduleReconnect();
      }
    });
  }

  onStatusChange('connecting');
  connect();

  return {
    sendClientMessage(message) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(clientMessageSchema.parse(message)));
      }
    },
    sendAudioFrame(frame) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(frame);
      }
    },
    reconnect() {
      reconnectAttemptCount = 0;
      onStatusChange('connecting');
      connect();
    },
    close() {
      isClosedByUs = true;
      socket?.close();
      onStatusChange('closed');
    },
  };
}
