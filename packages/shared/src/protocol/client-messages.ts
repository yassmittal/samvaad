import { z } from 'zod';
import { roomCodeSchema } from '../domain/room-code';
import { languageCodeSchema } from '../languages/supported-languages';

/**
 * Browser → API, as JSON text frames. Audio travels separately, as binary frames of
 * 16 kHz mono PCM16 (D-009), and needs no schema.
 */

/** Table mode: one phone, two languages (D-008). Sending it again replaces the session. */
export const startTableSessionMessageSchema = z.object({
  type: z.literal('start_table_session'),
  languageCodes: z
    .tuple([languageCodeSchema, languageCodeSchema])
    .refine(([firstLanguageCode, secondLanguageCode]) => firstLanguageCode !== secondLanguageCode, {
      error: 'The two languages must be different.',
    }),
});

export const MAXIMUM_PARTICIPANT_NAME_LENGTH = 40;

/** Shown to the others in the room. */
export const participantNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Enter your name.' })
  .max(MAXIMUM_PARTICIPANT_NAME_LENGTH, {
    error: `A name is at most ${MAXIMUM_PARTICIPANT_NAME_LENGTH} characters.`,
  });

/** Two-phone mode (D-008): open a room in your language. Leaves any room you are in first. */
export const createRoomMessageSchema = z.object({
  type: z.literal('create_room'),
  participantName: participantNameSchema,
  languageCode: languageCodeSchema,
});

/** Join someone's room by its code. Leaves any room you are in first. */
export const joinRoomMessageSchema = z.object({
  type: z.literal('join_room'),
  roomCode: roomCodeSchema,
  participantName: participantNameSchema,
  languageCode: languageCodeSchema,
});

/** Leave the room, or end the table session. The socket stays open. */
export const leaveRoomMessageSchema = z.object({
  type: z.literal('leave_room'),
});

/** Sent when the microphone opens or closes. Audio frames are only accepted while open. */
export const microphoneStateMessageSchema = z.object({
  type: z.literal('microphone_state'),
  isOpen: z.boolean(),
});

/** The listener's browser started speaking a translation (Phase 3), for the latency meter. */
export const playbackStartedMessageSchema = z.object({
  type: z.literal('playback_started'),
  utteranceId: z.string(),
  startedAtEpochMilliseconds: z.number(),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  startTableSessionMessageSchema,
  createRoomMessageSchema,
  joinRoomMessageSchema,
  leaveRoomMessageSchema,
  microphoneStateMessageSchema,
  playbackStartedMessageSchema,
]);

export type StartTableSessionMessage = z.infer<typeof startTableSessionMessageSchema>;
export type CreateRoomMessage = z.infer<typeof createRoomMessageSchema>;
export type JoinRoomMessage = z.infer<typeof joinRoomMessageSchema>;
export type LeaveRoomMessage = z.infer<typeof leaveRoomMessageSchema>;
export type MicrophoneStateMessage = z.infer<typeof microphoneStateMessageSchema>;
export type PlaybackStartedMessage = z.infer<typeof playbackStartedMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
