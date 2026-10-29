import { languageCodeSchema, participantNameSchema } from '@samvaad/shared';
import { z } from 'zod';

const REMEMBERED_ROOM_ENTRY_STORAGE_KEY = 'samvaad:room-entry';

export const roomEntrySchema = z.object({
  participantName: participantNameSchema,
  languageCode: languageCodeSchema,
});

/** Who you are in a room: your name and the one language you speak and hear. */
export type RoomEntry = z.infer<typeof roomEntrySchema>;

/** The name and language used last time on this device, so they needn't be typed again. */
export function findRememberedRoomEntry(): RoomEntry | null {
  try {
    const storedText = localStorage.getItem(REMEMBERED_ROOM_ENTRY_STORAGE_KEY);
    const parseResult = roomEntrySchema.safeParse(storedText ? JSON.parse(storedText) : null);
    return parseResult.success ? parseResult.data : null;
  } catch {
    return null;
  }
}

export function rememberRoomEntry(roomEntry: RoomEntry): void {
  try {
    localStorage.setItem(REMEMBERED_ROOM_ENTRY_STORAGE_KEY, JSON.stringify(roomEntry));
  } catch {
    // Private browsing can refuse storage; the form just starts empty next time.
  }
}
