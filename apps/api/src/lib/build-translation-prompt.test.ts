import { describe, expect, test } from 'bun:test';
import { buildTableModeTranslationPrompt } from './build-translation-prompt';

describe('buildTableModeTranslationPrompt', () => {
  const prompt = buildTableModeTranslationPrompt(['hi', 'en']);

  test('names both languages and both codes for the first line', () => {
    expect(prompt).toContain('between Hindi and English');
    expect(prompt).toContain('"hi" or "en"');
  });

  test('says to translate, never to answer', () => {
    expect(prompt).toContain('never reply');
    expect(prompt).toContain('do not answer it');
  });

  test('keeps names, numbers and tone, and treats Hinglish as Hindi', () => {
    expect(prompt).toContain('Keep names, numbers, prices and units exactly');
    expect(prompt).toContain('Hinglish) is Hindi');
  });
});
