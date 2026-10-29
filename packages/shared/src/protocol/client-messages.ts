import { z } from 'zod';
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

/** Sent when the microphone opens or closes. Audio frames are only accepted while open. */
export const microphoneStateMessageSchema = z.object({
  type: z.literal('microphone_state'),
  isOpen: z.boolean(),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  startTableSessionMessageSchema,
  microphoneStateMessageSchema,
]);

export type StartTableSessionMessage = z.infer<typeof startTableSessionMessageSchema>;
export type MicrophoneStateMessage = z.infer<typeof microphoneStateMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
