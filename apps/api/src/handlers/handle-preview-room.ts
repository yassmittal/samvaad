import type { PreviewRoomMessage } from '@samvaad/shared';
import type { ConversationConnection } from './conversation-connection';

/** Who is in a room, for the incoming-call screen, without joining it (D-022). */
export function handlePreviewRoom(
  connection: ConversationConnection,
  message: PreviewRoomMessage,
): void {
  const room = connection.roomRegistry.findRoom(message.roomCode);
  if (room === null) {
    connection.sendServerMessage({
      type: 'error',
      code: 'ROOM_NOT_FOUND',
      message: 'This call has ended, or the code is wrong.',
    });
    return;
  }
  connection.sendServerMessage({
    type: 'room_preview',
    roomCode: message.roomCode,
    participants: [...room.participants.values()].flatMap(({ membership }) =>
      membership?.participantName == null
        ? []
        : [
            {
              participantName: membership.participantName,
              languageCode: membership.languageCodes[0],
            },
          ],
    ),
  });
}
