import type { LanguageCode, ServerMessage } from '@samvaad/shared';
import { buildRecapSystemPrompt, formatRecapConversationText } from '../lib/build-recap-prompt';
import type { ConversationConnection, ConversationRoom } from './conversation-connection';
import { findListeners, sendToRoom } from './room-messages';

function sendToListenersIn(
  room: ConversationRoom,
  languageCode: LanguageCode,
  message: ServerMessage,
): void {
  for (const listener of findListeners(room, [languageCode])) {
    listener.sendServerMessage(message);
  }
}

/** One recap per language anyone in the room listens in: both of a table's (D-016). */
function findRecapLanguageCodes(room: ConversationRoom): LanguageCode[] {
  return [
    ...new Set(
      [...room.participants.values()].flatMap((participant) =>
        participant.membership ? [...participant.membership.languageCodes] : [],
      ),
    ),
  ];
}

async function writeAndSendRecap(
  connection: ConversationConnection,
  room: ConversationRoom,
  languageCode: LanguageCode,
): Promise<void> {
  try {
    const recapText = await connection.translationClient.writeRecap({
      systemPrompt: buildRecapSystemPrompt({ languageCode, context: room.context }),
      conversationText: formatRecapConversationText(room.utterances),
    });
    if (recapText.length === 0) {
      throw new Error('the recap came back empty');
    }
    sendToListenersIn(room, languageCode, {
      type: 'conversation_recap',
      languageCode,
      text: recapText,
    });
  } catch (error) {
    connection.logger.warn({ err: error, languageCode }, 'recap failed');
    sendToListenersIn(room, languageCode, {
      type: 'error',
      code: 'RECAP_UNAVAILABLE',
      message: 'The recap could not be written. Try ending the conversation again.',
    });
  }
}

/**
 * Ends the conversation for everyone in the room: each phone closes its mic on
 * `conversation_ended`, then gets the recap in its language from Muse Spark (D-016). The room
 * and its memory stay, so a later End recaps the whole conversation again.
 */
export async function handleEndConversation(connection: ConversationConnection): Promise<void> {
  const { membership } = connection;
  if (membership === null) {
    connection.sendServerMessage({
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Start a table session or join a room before ending a conversation.',
    });
    return;
  }
  const { room } = membership;
  if (room.utterances.length === 0) {
    connection.sendServerMessage({
      type: 'error',
      code: 'RECAP_UNAVAILABLE',
      message: 'Nothing has been said yet, so there is nothing to recap.',
    });
    return;
  }
  if (room.isWritingRecap) {
    return;
  }

  room.isWritingRecap = true;
  sendToRoom(room, { type: 'conversation_ended', participantName: membership.participantName });
  connection.logger.info(
    { utteranceCount: room.utterances.length, roomCode: room.roomCode },
    'conversation ended, writing recaps',
  );
  try {
    await Promise.all(
      findRecapLanguageCodes(room).map((languageCode) =>
        writeAndSendRecap(connection, room, languageCode),
      ),
    );
  } finally {
    room.isWritingRecap = false;
  }
}
