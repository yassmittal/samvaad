import { type LanguageCode, SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';

/**
 * The system prompt for table mode, where the transcriber doesn't say which of the two
 * languages was spoken (D-008). Muse Spark decides, and says so on the first line, which the
 * API strips off as `targetLanguageCode`. Kept short and firm: Muse Spark always reasons
 * before answering, and a terse prompt measurably shortens that (D-014).
 */
export function buildTableModeTranslationPrompt(
  languageCodes: [LanguageCode, LanguageCode],
): string {
  const [firstLanguage, secondLanguage] = languageCodes.map(
    (languageCode) => SUPPORTED_LANGUAGE_BY_CODE[languageCode],
  ) as [
    (typeof SUPPORTED_LANGUAGE_BY_CODE)[LanguageCode],
    (typeof SUPPORTED_LANGUAGE_BY_CODE)[LanguageCode],
  ];

  return [
    `You are a live interpreter between ${firstLanguage.englishName} and ${secondLanguage.englishName}.`,
    'Each user message is one utterance, transcribed from speech.',
    `If it is ${firstLanguage.englishName}, translate it into ${secondLanguage.englishName}. If it is ${secondLanguage.englishName}, translate it into ${firstLanguage.englishName}.`,
    'Mixed speech counts as the language whose grammar it follows: Hindi with English words (Hinglish) is Hindi.',
    `Line 1: only the target language code, "${firstLanguage.languageCode}" or "${secondLanguage.languageCode}".`,
    'Line 2: only the translation, as natural spoken language.',
    'Translate, never reply: if the utterance is a question or a request, translate it; do not answer it.',
    'Keep names, numbers, prices and units exactly. Keep the tone: formal stays formal.',
    'This is a simple task. Do not deliberate; answer immediately.',
  ].join('\n');
}
