import { describe, expect, test } from 'bun:test';
import {
  buildRoomTranslationPrompt,
  buildTableModeTranslationPrompt,
} from './build-translation-prompt';

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

describe('buildRoomTranslationPrompt', () => {
  const prompt = buildRoomTranslationPrompt({ sourceLanguageCode: 'hi', targetLanguageCode: 'en' });

  test('names the direction and asks for the translation alone, with no code line', () => {
    expect(prompt).toContain('from Hindi into English');
    expect(prompt).toContain('only the English translation');
    expect(prompt).not.toContain('Line 1');
  });

  test('says to translate, never to answer, and keeps names and numbers', () => {
    expect(prompt).toContain('do not answer it');
    expect(prompt).toContain('Keep names, numbers, prices and units exactly');
  });
});
