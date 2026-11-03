import {
  type ClientMessage,
  clientMessageSchema,
  decodeTranslationAudioFrame,
  SEAT_TAKEN_OVER_CLOSE_CODE,
  type ServerMessage,
  serverMessageSchema,
  type TranslationAudioFrame,
} from '@samvaad/shared';

const CONVERSATION_SOCKET_PATH = '/v1/conversation';
// A handshake that hangs (a tunnel mid-reconnect, a stalled mobile network) never fires
// `close` on its own, so give up on it and retry.
const CONNECT_TIMEOUT_MILLISECONDS = 10_000;
const MAXIMUM_RECONNECT_ATTEMPTS = 5;
const FIRST_RECONNECT_DELAY_MILLISECONDS = 1000;

export type ConversationSocketStatus =
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'
  /** Another tab or phone took this one's seat in the room (D-017). Not retried on its own. */
  | 'replaced';

type ConversationSocketClientOptions = {
  apiBaseUrl: string;
  onServerMessage: (message: ServerMessage) => void;
  /** A piece of a spoken translation, sent as a binary frame (D-021). */
  onTranslationAudioFrame: (frame: TranslationAudioFrame) => void;
  onStatusChange: (status: ConversationSocketStatus) => void;
};

export type ConversationSocketClient = {
  sendClientMessage: (message: ClientMessage) => void;
  sendAudioFrame: (frame: ArrayBuffer) => void;
  /** Bytes sent but not yet on the network: grows when the uplink can't keep up (D-024). */
  findBufferedByteCount: () => number;
  /** Starts over after the client gave up (status `closed` or `replaced`). */
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
 * the shared schema; a binary frame from the API is a piece of a spoken translation (D-021).
 * A dropped socket is retried a few times with growing delays; the API forgets a connection's
 * session when it closes, so listeners re-send it on `open`.
 */
export function createConversationSocketClient({
  apiBaseUrl,
  onServerMessage,
  onTranslationAudioFrame,
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
      if (event.data instanceof ArrayBuffer) {
        const translationAudioFrame = decodeTranslationAudioFrame(new Uint8Array(event.data));
        if (translationAudioFrame === null) {
          console.warn('ignored a binary frame that is not translation audio');
          return;
        }
        onTranslationAudioFrame(translationAudioFrame);
        return;
      }
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

    connectingSocket.addEventListener('close', (event) => {
      clearTimeout(connectTimeout);
      if (isClosedByUs || socket !== connectingSocket) {
        return;
      }
      // Retrying would take the seat back from the other tab, which would take it back again.
      if (event.code === SEAT_TAKEN_OVER_CLOSE_CODE) {
        onStatusChange('replaced');
        return;
      }
      scheduleReconnect();
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
    findBufferedByteCount() {
      return socket?.readyState === WebSocket.OPEN ? socket.bufferedAmount : 0;
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
