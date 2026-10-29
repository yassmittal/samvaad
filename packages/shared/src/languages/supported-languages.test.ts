import { describe, expect, test } from 'bun:test';
import { languageCodeSchema, SUPPORTED_LANGUAGES } from './supported-languages';

describe('SUPPORTED_LANGUAGES', () => {
  test('every language code is a unique two-letter ISO 639-1 code', () => {
    const languageCodes = SUPPORTED_LANGUAGES.map((language) => language.languageCode);

    expect(new Set(languageCodes).size).toBe(languageCodes.length);
    for (const languageCode of languageCodes) {
      expect(languageCode).toMatch(/^[a-z]{2}$/);
    }
  });

  test('every speech synthesis tag starts with its language code', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(language.speechSynthesisLanguageTag.startsWith(`${language.languageCode}-`)).toBe(
        true,
      );
    }
  });

  test('the demo pair, Hindi and English, is supported', () => {
    expect(languageCodeSchema.safeParse('hi').success).toBe(true);
    expect(languageCodeSchema.safeParse('en').success).toBe(true);
  });

  test('an unsupported language code is rejected', () => {
    expect(languageCodeSchema.safeParse('xx').success).toBe(false);
    expect(languageCodeSchema.safeParse('hi-IN').success).toBe(false);
  });
});
