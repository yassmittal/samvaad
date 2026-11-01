import { startConversationTestServers } from './start-conversation-test-servers';

type ChatCompletionsRequestBody = { messages: { role: string; content: string }[] };

/** The system prompt of a request the fake Muse Spark server received. */
export function findSystemPrompt(requestBody: Record<string, unknown>): string {
  return (requestBody as ChatCompletionsRequestBody).messages[0]?.content ?? '';
}

/** The user message of a request the fake Muse Spark server received. */
export function findUserText(requestBody: Record<string, unknown>): string {
  return (requestBody as ChatCompletionsRequestBody).messages[1]?.content ?? '';
}

/**
 * Asha creates a room in Hindi, Ben joins it in English (D-015). Their join messages are
 * consumed, so each browser's `receivedMessages` starts empty.
 */
export async function startHindiEnglishRoom(
  options: Parameters<typeof startConversationTestServers>[0] = {},
) {
  const servers = await startConversationTestServers(options);
  const hindiBrowser = servers.browser;
  hindiBrowser.sendJson({ type: 'create_room', participantName: 'Asha', languageCode: 'hi' });
  const { roomCode, participantId: hindiParticipantId } =
    await hindiBrowser.waitForMessage('room_joined');
  await hindiBrowser.waitForMessage('room_state');

  const englishBrowser = await servers.connectAnotherBrowser();
  englishBrowser.sendJson({
    type: 'join_room',
    roomCode,
    participantName: 'Ben',
    languageCode: 'en',
  });
  const { participantId: englishParticipantId } =
    await englishBrowser.waitForMessage('room_joined');
  // A joining phone is told the room's context (D-016); empty here.
  await englishBrowser.waitForMessage('conversation_context');
  await englishBrowser.waitForMessage('room_state');
  await hindiBrowser.waitForMessage('room_state');

  return {
    servers,
    roomCode,
    hindiBrowser,
    hindiParticipantId,
    englishBrowser,
    englishParticipantId,
  };
}

export type HindiEnglishRoom = Awaited<ReturnType<typeof startHindiEnglishRoom>>;
