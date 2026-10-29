import { describe, expect, test } from 'bun:test';
import { findLanguageBias } from './find-language-bias';

describe('findLanguageBias', () => {
  test('a table is biased to its two languages', () => {
    expect(findLanguageBias(['hi', 'ta'])).toEqual(['Hindi', 'Tamil']);
  });

  test('a room participant gets English added, for code-switching', () => {
    expect(findLanguageBias(['hi'])).toEqual(['Hindi', 'English']);
  });

  test('an English speaker is biased to English alone', () => {
    expect(findLanguageBias(['en'])).toEqual(['English']);
  });
});
