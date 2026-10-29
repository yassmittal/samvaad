import { type ServerMessage, serverMessageSchema } from '@samvaad/shared';
import { waitForCondition } from './wait-for-condition';

/** A stand-in for the browser: a real WebSocket that parses every server message. */
export async function connectTestBrowserClient(conversationSocketUrl: string) {
  const socket = new WebSocket(conversationSocketUrl);
  const receivedMessages: ServerMessage[] = [];
  socket.addEventListener('message', (event) => {
    receivedMessages.push(serverMessageSchema.parse(JSON.parse(String(event.data))));
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    socket,
    receivedMessages,
    sendJson: (message: unknown) => socket.send(JSON.stringify(message)),
    sendText: (text: string) => socket.send(text),
    sendAudioFrame: (frame: Uint8Array) => socket.send(frame),
    async waitForMessage<MessageType extends ServerMessage['type']>(
      type: MessageType,
    ): Promise<Extract<ServerMessage, { type: MessageType }>> {
      await waitForCondition(
        () => receivedMessages.some((message) => message.type === type),
        `a ${type} message`,
      );
      const index = receivedMessages.findIndex((message) => message.type === type);
      const [message] = receivedMessages.splice(index, 1);
      return message as Extract<ServerMessage, { type: MessageType }>;
    },
  };
}

export type TestBrowserClient = Awaited<ReturnType<typeof connectTestBrowserClient>>;
