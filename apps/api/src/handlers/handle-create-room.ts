import type { CreateRoomMessage } from '@samvaad/shared';
import type { ConversationConnection } from './conversation-connection';
import { leaveCurrentRoom } from './handle-leave-room';
import { broadcastRoomState } from './room-messages';

export function handleCreateRoom(
  connection: ConversationConnection,
  message: CreateRoomMessage,
): void {
  leaveCurrentRoom(connection);
  const room = connection.roomRegistry.createRoom(connection);
  connection.membership = {
    room,
    participantName: message.participantName,
    languageCodes: [message.languageCode],
  };
  connection.translationClient.warmConnection();
  connection.sendServerMessage({
    type: 'room_joined',
    roomCode: room.roomCode,
    participantId: connection.participantId,
  });
  broadcastRoomState(room);
}
