import { describe, expect, test } from 'bun:test';
import { pickDefaultLanguageCode } from './pick-default-language-code';

describe('pickDefaultLanguageCode', () => {
  test('the language this phone used last always wins', () => {
    expect(
      pickDefaultLanguageCode({
        rememberedLanguageCode: 'ta',
        browserLanguageTags: ['en-GB'],
        callerLanguageCode: 'hi',
      }),
    ).toBe('ta');
  });

  test('starting a call with nothing remembered picks the demo caller language', () => {
    expect(
      pickDefaultLanguageCode({
        rememberedLanguageCode: null,
        browserLanguageTags: ['en-IN'],
        callerLanguageCode: null,
      }),
    ).toBe('hi');
  });

  test('answering picks the browser language, skipping the caller language', () => {
    expect(
      pickDefaultLanguageCode({
        rememberedLanguageCode: null,
        browserLanguageTags: ['hi-IN', 'fr-FR'],
        callerLanguageCode: 'hi',
      }),
    ).toBe('fr');
  });

  test('answering with no usable browser language picks English, or Hindi for an English caller', () => {
    expect(
      pickDefaultLanguageCode({
        rememberedLanguageCode: null,
        browserLanguageTags: ['xx'],
        callerLanguageCode: 'hi',
      }),
    ).toBe('en');
    expect(
      pickDefaultLanguageCode({
        rememberedLanguageCode: null,
        browserLanguageTags: [],
        callerLanguageCode: 'en',
      }),
    ).toBe('hi');
  });
});
