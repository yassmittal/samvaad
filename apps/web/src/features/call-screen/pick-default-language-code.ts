import { type LanguageCode, languageCodeSchema } from '@samvaad/shared';

function isSupportedLanguageCode(candidate: string): candidate is LanguageCode {
  return languageCodeSchema.safeParse(candidate).success;
}

// The demo story: a Hindi speaker starts the call, an English speaker answers (roadmap).
export const DEFAULT_CALLER_LANGUAGE_CODE: LanguageCode = 'hi';
export const DEFAULT_ANSWERER_LANGUAGE_CODE: LanguageCode = 'en';

/**
 * The language to pre-select on the start and answer screens (D-022): the one this phone used
 * last, else the browser's, else the demo's. When answering, never the caller's own language
 * unless the person picked it before: two people with one language don't need Samvaad.
 */
export function pickDefaultLanguageCode({
  rememberedLanguageCode,
  browserLanguageTags,
  callerLanguageCode,
}: {
  rememberedLanguageCode: LanguageCode | null;
  /** `navigator.languages`, most preferred first. */
  browserLanguageTags: readonly string[];
  /** `null` when starting a call. */
  callerLanguageCode: LanguageCode | null;
}): LanguageCode {
  if (rememberedLanguageCode !== null) {
    return rememberedLanguageCode;
  }
  if (callerLanguageCode === null) {
    return DEFAULT_CALLER_LANGUAGE_CODE;
  }
  const browserLanguageCode = browserLanguageTags
    .map((languageTag) => languageTag.split('-')[0]?.toLowerCase() ?? '')
    .find(
      (languageCode): languageCode is LanguageCode =>
        isSupportedLanguageCode(languageCode) && languageCode !== callerLanguageCode,
    );
  if (browserLanguageCode !== undefined) {
    return browserLanguageCode;
  }
  return callerLanguageCode === DEFAULT_ANSWERER_LANGUAGE_CODE
    ? DEFAULT_CALLER_LANGUAGE_CODE
    : DEFAULT_ANSWERER_LANGUAGE_CODE;
}
