import {
  decodeTranslationAudioFrame,
  type ServerMessage,
  serverMessageSchema,
  type TranslationAudioFrame,
} from '@samvaad/shared';
import { waitForCondition } from './wait-for-condition';

/**
 * A stand-in for the browser: a real WebSocket that parses every server message, and decodes
 * every binary frame as a piece of a spoken translation (D-021).
 */
export async function connectTestBrowserClient(conversationSocketUrl: string) {
  const socket = new WebSocket(conversationSocketUrl);
  socket.binaryType = 'arraybuffer';
  const receivedMessages: ServerMessage[] = [];
  const receivedAudioFrames: TranslationAudioFrame[] = [];
  /** Everything in arrival order, as `message:<type>:<utteranceId>` or `audio:<utteranceId>`. */
  const timeline: string[] = [];
  socket.addEventListener('message', (event) => {
    if (event.data instanceof ArrayBuffer) {
      const audioFrame = decodeTranslationAudioFrame(new Uint8Array(event.data));
      if (audioFrame === null) {
        throw new Error('the API sent a binary frame that is not translation audio');
      }
      receivedAudioFrames.push(audioFrame);
      timeline.push(`audio:${audioFrame.utteranceId}`);
      return;
    }
    const message = serverMessageSchema.parse(JSON.parse(String(event.data)));
    receivedMessages.push(message);
    timeline.push(`message:${message.type}:${'utteranceId' in message ? message.utteranceId : ''}`);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    socket,
    receivedMessages,
    receivedAudioFrames,
    timeline,
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
