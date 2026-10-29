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

/** Part of an utterance's translation, as it streams in. Sent to the listener. */
export const translationDeltaMessageSchema = z.object({
  type: z.literal('translation_delta'),
  utteranceId: z.string(),
  targetLanguageCode: languageCodeSchema,
  textDelta: z.string(),
});

/** When each step of one utterance happened, for the latency meter (D-011). */
export const utteranceTimingsSchema = z.object({
  speechEndedAtEpochMilliseconds: z.number(),
  transcriptFinalAtEpochMilliseconds: z.number(),
  firstTranslationDeltaAtEpochMilliseconds: z.number(),
  translationCompleteAtEpochMilliseconds: z.number(),
});

/** The whole translation. From Phase 3, the listener's browser speaks it on arrival. */
export const translationCompleteMessageSchema = z.object({
  type: z.literal('translation_complete'),
  utteranceId: z.string(),
  targetLanguageCode: languageCodeSchema,
  text: z.string(),
  timings: utteranceTimingsSchema,
});

export const errorMessageSchema = z.object({
  type: z.literal('error'),
  code: errorCodeSchema,
  message: z.string(),
  /** Set when the problem concerns one utterance only, such as a failed translation. */
  utteranceId: z.string().optional(),
});

export const serverMessageSchema = z.discriminatedUnion('type', [
  sessionReadyMessageSchema,
  transcriptPartialMessageSchema,
  transcriptFinalMessageSchema,
  translationDeltaMessageSchema,
  translationCompleteMessageSchema,
  errorMessageSchema,
]);

export type SessionReadyMessage = z.infer<typeof sessionReadyMessageSchema>;
export type TranscriptPartialMessage = z.infer<typeof transcriptPartialMessageSchema>;
export type TranscriptFinalMessage = z.infer<typeof transcriptFinalMessageSchema>;
export type TranslationDeltaMessage = z.infer<typeof translationDeltaMessageSchema>;
export type UtteranceTimings = z.infer<typeof utteranceTimingsSchema>;
export type TranslationCompleteMessage = z.infer<typeof translationCompleteMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
