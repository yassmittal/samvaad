import { describe, expect, test } from 'bun:test';
import { type ConversationUtterance, selectConversationMemory } from './conversation-memory';

function createUtterance(index: number, overrides: Partial<ConversationUtterance> = {}) {
  return {
    utteranceId: `utterance-${index}`,
    speakerName: 'Ramesh',
    languageCode: 'hi',
    transcript: `transcript ${index}`,
    translationsByLanguageCode: {},
    ...overrides,
  } satisfies ConversationUtterance;
}

describe('selectConversationMemory', () => {
  test('keeps the last few utterances, oldest first', () => {
    const earlierUtterances = Array.from({ length: 10 }, (_, index) => createUtterance(index));

    const memory = selectConversationMemory({
      earlierUtterances,
      candidateTargetLanguageCodes: ['en'],
      maximumUtteranceCount: 3,
    });

    expect(memory.map((utterance) => utterance.transcript)).toEqual([
      'transcript 7',
      'transcript 8',
      'transcript 9',
    ]);
  });

  test('shows the translation into this target language only', () => {
    const earlierUtterances = [
      createUtterance(0, { translationsByLanguageCode: { en: 'Hello.' } }),
      createUtterance(1, { translationsByLanguageCode: { ta: 'வணக்கம்.' } }),
    ];

    const memory = selectConversationMemory({
      earlierUtterances,
      candidateTargetLanguageCodes: ['en'],
    });

    expect(memory.map((utterance) => utterance.translation)).toEqual(['Hello.', null]);
  });

  test('at a table, a translation into either language counts', () => {
    const earlierUtterances = [
      createUtterance(0, {
        speakerName: null,
        languageCode: null,
        translationsByLanguageCode: { hi: 'नमस्ते।' },
      }),
    ];

    const memory = selectConversationMemory({
      earlierUtterances,
      candidateTargetLanguageCodes: ['hi', 'en'],
    });

    expect(memory[0]?.translation).toBe('नमस्ते।');
  });

  test('no earlier utterances, no memory', () => {
    expect(
      selectConversationMemory({ earlierUtterances: [], candidateTargetLanguageCodes: ['en'] }),
    ).toEqual([]);
  });
});
