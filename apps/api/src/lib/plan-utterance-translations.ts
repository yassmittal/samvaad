import type { LanguageCode } from '@samvaad/shared';

/** What a participant speaks and listens in: one language in a room, two at a table (D-008). */
export type ParticipantLanguageCodes =
  | readonly [LanguageCode]
  | readonly [LanguageCode, LanguageCode];

export type UtteranceTranslationPlan =
  /** Table mode: the transcriber can't say which of the two was spoken, so Muse Spark decides. */
  | { kind: 'between_table_languages'; languageCodes: readonly [LanguageCode, LanguageCode] }
  /** A room: the speaker's language is known (D-015). */
  | {
      kind: 'into_listener_language';
      sourceLanguageCode: LanguageCode;
      targetLanguageCode: LanguageCode;
    };

/**
 * The translations one finished utterance needs: one per distinct listener language other
 * than the speaker's, so two English listeners share one. A listener in the speaker's own
 * language needs none; the transcript is enough.
 */
export function planUtteranceTranslations({
  speakerLanguageCodes,
  roomLanguageCodes,
}: {
  speakerLanguageCodes: ParticipantLanguageCodes;
  /** Every participant's languages, the speaker's included. */
  roomLanguageCodes: readonly ParticipantLanguageCodes[];
}): UtteranceTranslationPlan[] {
  if (speakerLanguageCodes.length === 2) {
    return [{ kind: 'between_table_languages', languageCodes: speakerLanguageCodes }];
  }
  const [sourceLanguageCode] = speakerLanguageCodes;
  const targetLanguageCodes = new Set(roomLanguageCodes.flat());
  targetLanguageCodes.delete(sourceLanguageCode);
  return [...targetLanguageCodes].map((targetLanguageCode) => ({
    kind: 'into_listener_language',
    sourceLanguageCode,
    targetLanguageCode,
  }));
}

/** The languages a planned translation may come out in. */
export function findCandidateTargetLanguageCodes(
  plan: UtteranceTranslationPlan,
): readonly LanguageCode[] {
  return plan.kind === 'between_table_languages' ? plan.languageCodes : [plan.targetLanguageCode];
}

/** A translation into any of `candidateTargetLanguageCodes` is for this listener. */
export function isListeningIn(
  listenerLanguageCodes: ParticipantLanguageCodes,
  candidateTargetLanguageCodes: readonly LanguageCode[],
): boolean {
  return listenerLanguageCodes.some((languageCode) =>
    candidateTargetLanguageCodes.includes(languageCode),
  );
}
