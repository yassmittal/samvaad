import { z } from 'zod';

export const ROOM_CODE_LENGTH = 6;

/** Letters and digits with the look-alikes left out (0/O, 1/I/L), so a code read aloud or typed survives. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Accepts a typed code in any case and with stray spaces, and gives it back normalised. */
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(ROOM_CODE_PATTERN, { error: 'A room code is 6 letters and digits.' });

export type RoomCode = z.infer<typeof roomCodeSchema>;
