import type { LanguageCode, RoomParticipant, ServerMessage } from '@samvaad/shared';
import { isListeningIn } from '../lib/plan-utterance-translations';
import type { ConversationConnection, ConversationRoom } from './conversation-connection';

export function sendToRoom(room: ConversationRoom, message: ServerMessage): void {
  for (const participant of room.participants.values()) {
    participant.sendServerMessage(message);
  }
}

/** Everyone in the room who listens in any of these languages. */
export function findListeners(
  room: ConversationRoom,
  candidateTargetLanguageCodes: readonly LanguageCode[],
): ConversationConnection[] {
  return [...room.participants.values()].filter(
    (participant) =>
      participant.membership !== null &&
      isListeningIn(participant.membership.languageCodes, candidateTargetLanguageCodes),
  );
}

function toRoomParticipant(participant: ConversationConnection): RoomParticipant[] {
  const { membership } = participant;
  if (membership === null || membership.participantName === null) {
    return [];
  }
  return [
    {
      participantId: participant.participantId,
      participantName: membership.participantName,
      languageCode: membership.languageCodes[0],
      isMicrophoneOpen: participant.activeTranscription !== null,
    },
  ];
}

/** Tells everyone who is here. A table room has no one else to tell. */
export function broadcastRoomState(room: ConversationRoom): void {
  if (room.roomCode === null) {
    return;
  }
  sendToRoom(room, {
    type: 'room_state',
    roomCode: room.roomCode,
    participants: [...room.participants.values()].flatMap(toRoomParticipant),
  });
}

/** Cancels the translations nobody left in the room can receive; all of them once it's empty. */
export function cancelTranslationsWithoutListeners(room: ConversationRoom): void {
  for (const translationJob of room.translationJobs) {
    if (findListeners(room, translationJob.candidateTargetLanguageCodes).length === 0) {
      translationJob.abortController.abort();
      room.translationJobs.delete(translationJob);
    }
  }
}
