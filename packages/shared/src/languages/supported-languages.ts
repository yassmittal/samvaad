import { z } from 'zod';

export type SupportedLanguage = {
  /** ISO 639-1 code, the id used everywhere in the protocol. */
  languageCode: string;
  /** Also the name Muse Voice Transcribe expects in its `languageBias` list (D-005). */
  englishName: string;
  nativeName: string;
  /** BCP-47 tag used to pick a `speechSynthesis` voice (D-007). */
  speechSynthesisLanguageTag: string;
};

/**
 * Languages that both Meta's transcriber and a common phone browser voice are likely to
 * support. Hindi and English are the demo pair; the rest are offered but less tested.
 */
export const SUPPORTED_LANGUAGES = [
  {
    languageCode: 'hi',
    englishName: 'Hindi',
    nativeName: 'हिन्दी',
    speechSynthesisLanguageTag: 'hi-IN',
  },
  {
    languageCode: 'en',
    englishName: 'English',
    nativeName: 'English',
    speechSynthesisLanguageTag: 'en-IN',
  },
  {
    languageCode: 'ta',
    englishName: 'Tamil',
    nativeName: 'தமிழ்',
    speechSynthesisLanguageTag: 'ta-IN',
  },
  {
    languageCode: 'te',
    englishName: 'Telugu',
    nativeName: 'తెలుగు',
    speechSynthesisLanguageTag: 'te-IN',
  },
  {
    languageCode: 'kn',
    englishName: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    speechSynthesisLanguageTag: 'kn-IN',
  },
  {
    languageCode: 'mr',
    englishName: 'Marathi',
    nativeName: 'मराठी',
    speechSynthesisLanguageTag: 'mr-IN',
  },
  {
    languageCode: 'bn',
    englishName: 'Bengali',
    nativeName: 'বাংলা',
    speechSynthesisLanguageTag: 'bn-IN',
  },
  {
    languageCode: 'es',
    englishName: 'Spanish',
    nativeName: 'Español',
    speechSynthesisLanguageTag: 'es-ES',
  },
  {
    languageCode: 'fr',
    englishName: 'French',
    nativeName: 'Français',
    speechSynthesisLanguageTag: 'fr-FR',
  },
  {
    languageCode: 'de',
    englishName: 'German',
    nativeName: 'Deutsch',
    speechSynthesisLanguageTag: 'de-DE',
  },
  {
    languageCode: 'ja',
    englishName: 'Japanese',
    nativeName: '日本語',
    speechSynthesisLanguageTag: 'ja-JP',
  },
  {
    languageCode: 'ar',
    englishName: 'Arabic',
    nativeName: 'العربية',
    speechSynthesisLanguageTag: 'ar-SA',
  },
] as const satisfies readonly SupportedLanguage[];

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['languageCode'];

const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((language) => language.languageCode) as [
  LanguageCode,
  ...LanguageCode[],
];

export const languageCodeSchema = z.enum(SUPPORTED_LANGUAGE_CODES);
