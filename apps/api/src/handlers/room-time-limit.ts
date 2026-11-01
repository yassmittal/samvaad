import type { ConversationConnection, ConversationRoom } from './conversation-connection';
import { broadcastRoomState, sendToRoom } from './room-messages';
import { endTranscription } from './transcription-lifecycle';

const MILLISECONDS_PER_MINUTE = 60 * 1000;

function createTimeLimitMessage(maximumRoomDurationMinutes: number) {
  return {
    type: 'error',
    code: 'ROOM_TIME_LIMIT_REACHED',
    message: `This conversation reached its ${maximumRoomDurationMinutes}-minute limit, so the microphones are off.`,
  } as const;
}

function hasRoomTimeRunOut(room: ConversationRoom, maximumRoomDurationMinutes: number): boolean {
  return (
    room.hasReachedTimeLimit ||
    Date.now() - room.createdAtEpochMilliseconds >=
      maximumRoomDurationMinutes * MILLISECONDS_PER_MINUTE
  );
}

/**
 * `MAX_ROOM_DURATION_MINUTES` (D-017): once a room has been open that long, every microphone in
 * it closes and stays closed, so a forgotten open mic can't drain the credit. Checked at each
 * audio frame, since an open mic sends 12 a second. Returns `true` when the frame must be dropped.
 */
export function enforceRoomTimeLimit(connection: ConversationConnection): boolean {
  const { membership, env } = connection;
  if (membership === null || !hasRoomTimeRunOut(membership.room, env.MAX_ROOM_DURATION_MINUTES)) {
    return false;
  }
  const { room } = membership;
  if (!room.hasReachedTimeLimit) {
    room.hasReachedTimeLimit = true;
    connection.logger.info({ roomCode: room.roomCode }, 'room time limit reached: microphones off');
    // Meta still finishes each utterance in progress, and it is translated as usual.
    for (const participant of room.participants.values()) {
      endTranscription(participant);
    }
    sendToRoom(room, createTimeLimitMessage(env.MAX_ROOM_DURATION_MINUTES));
    broadcastRoomState(room);
  }
  return true;
}

/** Refuses a microphone in a room past its limit. Returns `true` when refused. */
export function refuseMicrophoneAfterTimeLimit(connection: ConversationConnection): boolean {
  const { membership, env } = connection;
  if (membership === null || !hasRoomTimeRunOut(membership.room, env.MAX_ROOM_DURATION_MINUTES)) {
    return false;
  }
  connection.sendServerMessage(createTimeLimitMessage(env.MAX_ROOM_DURATION_MINUTES));
  return true;
}
