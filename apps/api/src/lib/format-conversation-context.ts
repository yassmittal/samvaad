import { type GlossaryTerm, type LanguageCode, SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';

/** Prompt lines shared by the translation and recap prompts (D-016). */

export function formatSettingLines(setting: string): string[] {
  return setting.length > 0 ? [`About this conversation: ${setting}`] : [];
}

export function formatGlossaryLines(glossaryTerms: readonly GlossaryTerm[]): string[] {
  if (glossaryTerms.length === 0) {
    return [];
  }
  return [
    'Glossary. Use these exact forms, and read a transcribed word that sounds like one of them as that term:',
    ...glossaryTerms.map(({ term, preferredTranslation }) =>
      preferredTranslation.length > 0
        ? `- ${term} = ${preferredTranslation}`
        : `- ${term} (keep as is)`,
    ),
  ];
}

/** "Ramesh (Hindi)" in a room. A table knows neither, so its lines get a dash. */
export function formatSpeakerLabel({
  speakerName,
  languageCode,
}: {
  speakerName: string | null;
  languageCode: LanguageCode | null;
}): string | null {
  if (speakerName === null) {
    return null;
  }
  return languageCode === null
    ? speakerName
    : `${speakerName} (${SUPPORTED_LANGUAGE_BY_CODE[languageCode].englishName})`;
}

export function formatTranscriptLine(utterance: {
  speakerName: string | null;
  languageCode: LanguageCode | null;
  transcript: string;
}): string {
  const speakerLabel = formatSpeakerLabel(utterance);
  return speakerLabel === null
    ? `- ${utterance.transcript}`
    : `${speakerLabel}: ${utterance.transcript}`;
}
