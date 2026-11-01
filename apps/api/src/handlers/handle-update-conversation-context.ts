import type { ConversationContext, UpdateConversationContextMessage } from '@samvaad/shared';
import type { ConversationConnection } from './conversation-connection';
import { sendToRoom } from './room-messages';
import { refreshTranscriptionKeywords } from './transcription-lifecycle';

/** Tells one phone, or everyone, what the room's context is now (D-016). */
export function createConversationContextMessage(
  context: ConversationContext,
  updatedByParticipantName: string | null,
) {
  return {
    type: 'conversation_context',
    ...context,
    updatedByParticipantName,
  } as const;
}

/** Replaces the context of the whole room. It applies from the next utterance translated. */
export function handleUpdateConversationContext(
  connection: ConversationConnection,
  { setting, glossaryTerms }: UpdateConversationContextMessage,
): void {
  const { membership } = connection;
  if (membership === null) {
    connection.sendServerMessage({
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Start a table session or join a room before setting its context.',
    });
    return;
  }
  const { room } = membership;
  room.context = { setting, glossaryTerms };
  sendToRoom(room, createConversationContextMessage(room.context, membership.participantName));
  for (const participant of room.participants.values()) {
    refreshTranscriptionKeywords(participant);
  }
}
