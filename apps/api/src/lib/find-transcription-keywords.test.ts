import { describe, expect, test } from 'bun:test';
import { findTranscriptionKeywords, haveSameKeywords } from './find-transcription-keywords';

describe('findTranscriptionKeywords', () => {
  test('each term and its other-language form, once each', () => {
    expect(
      findTranscriptionKeywords([
        { term: 'blue pottery', preferredTranslation: 'ब्लू पॉटरी' },
        { term: 'Kumawat', preferredTranslation: '' },
        { term: 'Blue pottery set', preferredTranslation: 'ब्लू पॉटरी' },
      ]),
    ).toEqual(['blue pottery', 'ब्लू पॉटरी', 'Kumawat', 'Blue pottery set']);
  });

  test('no glossary, no keywords', () => {
    expect(findTranscriptionKeywords([])).toEqual([]);
  });
});

describe('haveSameKeywords', () => {
  test('compares in order', () => {
    expect(haveSameKeywords(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(haveSameKeywords(['a', 'b'], ['a'])).toBe(false);
    expect(haveSameKeywords(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});
