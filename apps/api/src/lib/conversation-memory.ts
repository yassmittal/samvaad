import type { LanguageCode } from '@samvaad/shared';

/** How many earlier utterances a translation prompt sees (D-016). */
export const CONVERSATION_MEMORY_UTTERANCE_COUNT = 8;

/** One finished utterance, kept by the room for translation prompts and the recap (D-004, D-016). */
export type ConversationUtterance = {
  utteranceId: string;
  /** `null` at a table, where one phone hears both people. */
  speakerName: string | null;
  /** Known in a room (D-015); `null` at a table (D-008). */
  languageCode: LanguageCode | null;
  transcript: string;
  /** Each finished translation, by the language it came out in. */
  translationsByLanguageCode: Partial<Record<LanguageCode, string>>;
};

/** An earlier utterance as one translation prompt shows it. */
export type MemoryUtterance = {
  speakerName: string | null;
  languageCode: LanguageCode | null;
  transcript: string;
  /** Its translation into this request's target language, once one exists. */
  translation: string | null;
};

/**
 * The last few utterances before the one being translated, each with its translation into the
 * language this translation may come out in, so terms stay consistent with earlier ones.
 */
export function selectConversationMemory({
  earlierUtterances,
  candidateTargetLanguageCodes,
  maximumUtteranceCount = CONVERSATION_MEMORY_UTTERANCE_COUNT,
}: {
  earlierUtterances: readonly ConversationUtterance[];
  candidateTargetLanguageCodes: readonly LanguageCode[];
  maximumUtteranceCount?: number;
}): MemoryUtterance[] {
  if (maximumUtteranceCount <= 0) {
    return [];
  }
  return earlierUtterances.slice(-maximumUtteranceCount).map((utterance) => ({
    speakerName: utterance.speakerName,
    languageCode: utterance.languageCode,
    transcript: utterance.transcript,
    translation:
      candidateTargetLanguageCodes
        .map((languageCode) => utterance.translationsByLanguageCode[languageCode])
        .find((translation) => translation !== undefined) ?? null,
  }));
}
