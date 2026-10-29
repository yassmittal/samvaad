import { type LanguageCode, SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';
import type { ParticipantLanguageCodes } from './plan-utterance-translations';

// Most speakers mix English words in (Hinglish), so a room speaker is biased to their language
// and English, the same pair table mode uses for Hindi (D-005, D-015).
const CODE_SWITCHING_LANGUAGE_CODE: LanguageCode = 'en';

/**
 * Muse Voice Transcribe's `languageBias`: English language names (D-005). A table's two
 * languages; a room participant's language plus English.
 */
export function findLanguageBias(languageCodes: ParticipantLanguageCodes): string[] {
  const biasedLanguageCodes = new Set<LanguageCode>(languageCodes);
  if (languageCodes.length === 1) {
    biasedLanguageCodes.add(CODE_SWITCHING_LANGUAGE_CODE);
  }
  return [...biasedLanguageCodes].map(
    (languageCode) => SUPPORTED_LANGUAGE_BY_CODE[languageCode].englishName,
  );
}
