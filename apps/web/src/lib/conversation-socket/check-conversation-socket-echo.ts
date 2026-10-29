const CONVERSATION_SOCKET_PATH = '/v1/conversation';

export function createConversationSocketUrl(apiBaseUrl: string): string {
  const socketUrl = new URL(CONVERSATION_SOCKET_PATH, apiBaseUrl);
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return socketUrl.toString();
}

type EchoCheckOptions = {
  apiBaseUrl: string;
  timeoutMilliseconds: number;
};

/**
 * Phase 0 only: opens the conversation socket, sends a ping and waits for the API to echo it.
 * Resolves with the round trip time. Phase 1 replaces this with the real socket client.
 */
export function checkConversationSocketEcho({
  apiBaseUrl,
  timeoutMilliseconds,
}: EchoCheckOptions): Promise<{ roundTripMilliseconds: number }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(createConversationSocketUrl(apiBaseUrl));
    const sentAtEpochMilliseconds = Date.now();

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`No echo within ${timeoutMilliseconds} ms.`));
    }, timeoutMilliseconds);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'ping', sentAtEpochMilliseconds }));
    });

    socket.addEventListener('message', (event) => {
      clearTimeout(timeout);
      socket.close();
      const echo: unknown = JSON.parse(String(event.data));
      const isOurPing =
        typeof echo === 'object' &&
        echo !== null &&
        'sentAtEpochMilliseconds' in echo &&
        echo.sentAtEpochMilliseconds === sentAtEpochMilliseconds;

      if (isOurPing) {
        resolve({ roundTripMilliseconds: Date.now() - sentAtEpochMilliseconds });
      } else {
        reject(new Error(`Unexpected reply: ${String(event.data)}`));
      }
    });

    socket.addEventListener('close', (event) => {
      clearTimeout(timeout);
      reject(
        new Error(`Socket closed (code ${event.code}${event.reason ? `, ${event.reason}` : ''}).`),
      );
    });
  });
}
