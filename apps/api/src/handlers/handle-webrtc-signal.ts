import type { WebrtcSignalClientMessage } from '@samvaad/shared';
import type { ConversationConnection } from './conversation-connection';

/**
 * Passes one part of the peer connection's setup to the other phone of the same room (D-023).
 * Never to a stranger, and not at a table, where there is nobody to connect to.
 */
export function handleWebrtcSignal(
  connection: ConversationConnection,
  { toParticipantId, description, candidate }: WebrtcSignalClientMessage,
): void {
  const room = connection.membership?.room;
  const otherParticipant =
    room?.roomCode == null ? undefined : room.participants.get(toParticipantId);
  if (otherParticipant === undefined || otherParticipant === connection) {
    connection.logger.warn({ toParticipantId }, 'webrtc signal to nobody in this room: dropped');
    return;
  }
  otherParticipant.sendServerMessage({
    type: 'webrtc_signal',
    fromParticipantId: connection.participantId,
    ...(description === undefined ? {} : { description }),
    ...(candidate === undefined ? {} : { candidate }),
  });
}
