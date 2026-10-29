import { describe, expect, test } from 'bun:test';
import { createTargetLanguageLineParser } from './target-language-line-parser';

function createParser() {
  return createTargetLanguageLineParser({
    languageCodes: ['hi', 'en'],
    fallbackLanguageCode: 'en',
  });
}

describe('createTargetLanguageLineParser', () => {
  test('splits the code line off, then passes the translation through', () => {
    const parser = createParser();

    expect(parser.push('e')).toBeNull();
    expect(parser.push('n\nHello, ')).toEqual({ targetLanguageCode: 'en', textDelta: 'Hello, ' });
    expect(parser.push('we have')).toEqual({ targetLanguageCode: 'en', textDelta: 'we have' });
    expect(parser.hasUsedFallback()).toBe(false);
  });

  test('reads a code line that arrives on its own', () => {
    const parser = createParser();

    expect(parser.push('hi\n')).toEqual({ targetLanguageCode: 'hi', textDelta: '' });
    expect(parser.push('नमस्ते')).toEqual({ targetLanguageCode: 'hi', textDelta: 'नमस्ते' });
  });

  test('tolerates capitals, quotes and spaces around the code', () => {
    const parser = createParser();

    expect(parser.push(' "HI"\nनमस्ते')).toEqual({ targetLanguageCode: 'hi', textDelta: 'नमस्ते' });
  });

  test('falls back when there is no code line, keeping all the text', () => {
    const parser = createParser();

    expect(parser.push('Hello, we have two hundred vases')).toEqual({
      targetLanguageCode: 'en',
      textDelta: 'Hello, we have two hundred vases',
    });
    expect(parser.hasUsedFallback()).toBe(true);
  });

  test('falls back for a code outside the pair, and drops that line', () => {
    const parser = createParser();

    expect(parser.push('fr\nBonjour')).toEqual({ targetLanguageCode: 'en', textDelta: 'Bonjour' });
    expect(parser.hasUsedFallback()).toBe(true);
  });

  test('a very short answer with no code line is still delivered at the end', () => {
    const parser = createParser();

    expect(parser.push('Yes.')).toBeNull();
    expect(parser.finish()).toEqual({ targetLanguageCode: 'en', textDelta: 'Yes.' });
  });
});
