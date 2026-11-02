import type { RoomParticipant } from '@samvaad/shared';

/**
 * The participant who joined second makes the WebRTC offer and the first answers (D-023), so
 * the two phones never both offer at once. The API lists participants in the order they joined.
 */
export function isOfferingParticipant(
  participants: readonly Pick<RoomParticipant, 'participantId'>[],
  participantId: string | null,
): boolean {
  return participantId !== null && participants[1]?.participantId === participantId;
}
