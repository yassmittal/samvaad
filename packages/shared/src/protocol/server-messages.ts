import { z } from 'zod';
import { errorCodeSchema } from '../domain/error-code';
import { languageCodeSchema } from '../languages/supported-languages';

/** API → browser, as JSON text frames. */

export const sessionReadyMessageSchema = z.object({
  type: z.literal('session_ready'),
  participantId: z.string(),
  languageCodes: z.tuple([languageCodeSchema, languageCodeSchema]),
});

/** The growing transcript of the utterance being spoken. Sent to the speaker only. */
export const transcriptPartialMessageSchema = z.object({
  type: z.literal('transcript_partial'),
  utteranceId: z.string(),
  text: z.string(),
});

/** A finished utterance. Sent to everyone. */
export const transcriptFinalMessageSchema = z.object({
  type: z.literal('transcript_final'),
  utteranceId: z.string(),
  speakerParticipantId: z.string(),
  /** `null` in table mode: the transcriber doesn't report which language was spoken (D-008). */
  languageCode: languageCodeSchema.nullable(),
  text: z.string(),
  speechEndedAtEpochMilliseconds: z.number(),
});

export const errorMessageSchema = z.object({
  type: z.literal('error'),
  code: errorCodeSchema,
  message: z.string(),
});

export const serverMessageSchema = z.discriminatedUnion('type', [
  sessionReadyMessageSchema,
  transcriptPartialMessageSchema,
  transcriptFinalMessageSchema,
  errorMessageSchema,
]);

export type SessionReadyMessage = z.infer<typeof sessionReadyMessageSchema>;
export type TranscriptPartialMessage = z.infer<typeof transcriptPartialMessageSchema>;
export type TranscriptFinalMessage = z.infer<typeof transcriptFinalMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
