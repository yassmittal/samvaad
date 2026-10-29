import type { LanguageCode } from '@samvaad/shared';

// A language code line is a few characters; past this, the model ignored the format.
const MAXIMUM_TARGET_LANGUAGE_LINE_LENGTH = 16;

type TargetLanguageLineParserOptions = {
  languageCodes: readonly [LanguageCode, LanguageCode];
  /** Used when the model leaves out the code line or names a language outside the pair. */
  fallbackLanguageCode: LanguageCode;
};

export type ParsedTranslationDelta = {
  targetLanguageCode: LanguageCode;
  textDelta: string;
};

/**
 * Muse Spark's table-mode answer starts with a line naming the target language, then the
 * translation (see `build-translation-prompt.ts`). This splits that line off as the stream
 * arrives. `push` returns `null` until the line is complete, then each translation delta.
 */
export function createTargetLanguageLineParser({
  languageCodes,
  fallbackLanguageCode,
}: TargetLanguageLineParserOptions) {
  let targetLanguageCode: LanguageCode | null = null;
  let bufferedText = '';
  let hasUsedFallback = false;

  function findLanguageCode(line: string): LanguageCode | null {
    const normalizedLine = line
      .trim()
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    return languageCodes.find((languageCode) => languageCode === normalizedLine) ?? null;
  }

  return {
    push(textDelta: string): ParsedTranslationDelta | null {
      if (targetLanguageCode !== null) {
        return { targetLanguageCode, textDelta };
      }
      bufferedText += textDelta;
      const newlineIndex = bufferedText.indexOf('\n');
      const hasCodeLine =
        newlineIndex !== -1 && newlineIndex <= MAXIMUM_TARGET_LANGUAGE_LINE_LENGTH;
      if (!hasCodeLine && bufferedText.length <= MAXIMUM_TARGET_LANGUAGE_LINE_LENGTH) {
        return null;
      }

      const languageCode = hasCodeLine
        ? findLanguageCode(bufferedText.slice(0, newlineIndex))
        : null;
      targetLanguageCode = languageCode ?? fallbackLanguageCode;
      hasUsedFallback = languageCode === null;
      // A short first line is the code line even when it is malformed; anything else is text.
      const translationText = hasCodeLine
        ? bufferedText.slice(newlineIndex + 1).trimStart()
        : bufferedText;
      bufferedText = '';
      return { targetLanguageCode, textDelta: translationText };
    },

    /** Call at the end of the stream: an answer shorter than the code line is still text. */
    finish(): ParsedTranslationDelta | null {
      if (targetLanguageCode !== null || bufferedText.length === 0) {
        return null;
      }
      targetLanguageCode = fallbackLanguageCode;
      hasUsedFallback = true;
      return { targetLanguageCode, textDelta: bufferedText.trim() };
    },

    hasUsedFallback: () => hasUsedFallback,
  };
}
