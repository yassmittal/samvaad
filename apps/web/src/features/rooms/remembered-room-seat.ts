const REMEMBERED_ROOM_SEAT_STORAGE_KEY_PREFIX = 'samvaad:room-seat:';

/*
 * This tab's participant id in each room, so a reload or a dropped socket takes the same seat
 * back (D-017). `sessionStorage`, not `localStorage`: it belongs to this tab, so another tab
 * opening the same room joins as someone else.
 */

export function findRememberedParticipantId(roomCode: string): string | null {
  try {
    return sessionStorage.getItem(REMEMBERED_ROOM_SEAT_STORAGE_KEY_PREFIX + roomCode);
  } catch {
    return null;
  }
}

export function rememberParticipantId(roomCode: string, participantId: string): void {
  try {
    sessionStorage.setItem(REMEMBERED_ROOM_SEAT_STORAGE_KEY_PREFIX + roomCode, participantId);
  } catch {
    // Private browsing can refuse storage; a reload then joins as a new participant.
  }
}

/** After leaving on purpose, coming back is joining again. */
export function forgetParticipantId(roomCode: string): void {
  try {
    sessionStorage.removeItem(REMEMBERED_ROOM_SEAT_STORAGE_KEY_PREFIX + roomCode);
  } catch {
    // Nothing remembered, nothing to forget.
  }
}
