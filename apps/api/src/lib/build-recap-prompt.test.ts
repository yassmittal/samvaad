import { describe, expect, test } from 'bun:test';
import { DEMO_CONVERSATION_PRESET, EMPTY_CONVERSATION_CONTEXT } from '@samvaad/shared';
import {
  buildRecapSystemPrompt,
  formatRecapConversationText,
  RECAP_CONVERSATION_MAXIMUM_CHARACTER_COUNT,
} from './build-recap-prompt';
import type { ConversationUtterance } from './conversation-memory';

function createUtterance(
  transcript: string,
  overrides: Partial<ConversationUtterance> = {},
): ConversationUtterance {
  return {
    utteranceId: transcript,
    speakerName: 'Siobhan',
    languageCode: 'en',
    transcript,
    translationsByLanguageCode: {},
    ...overrides,
  };
}

describe('buildRecapSystemPrompt', () => {
  test('asks for the three sections in the reader’s language, and no transcript', () => {
    const prompt = buildRecapSystemPrompt({
      languageCode: 'hi',
      context: EMPTY_CONVERSATION_CONTEXT,
    });

    expect(prompt).toContain('Write the recap in Hindi only');
    expect(prompt).toContain('What was agreed');
    expect(prompt).toContain('Numbers and dates');
    expect(prompt).toContain('Open questions');
    expect(prompt).toContain('Not a transcript');
    expect(prompt).not.toContain('About this conversation');
  });

  test('includes the setting and the glossary, for spellings', () => {
    const prompt = buildRecapSystemPrompt({
      languageCode: 'en',
      context: DEMO_CONVERSATION_PRESET.context,
    });

    expect(prompt).toContain('About this conversation: Ramesh Kumawat');
    expect(prompt).toContain('- Siobhan = शिवॉन');
  });
});

describe('formatRecapConversationText', () => {
  test('one line per utterance, with who said it in which language', () => {
    const text = formatRecapConversationText([
      createUtterance('Three hundred platters, please.'),
      createUtterance('ठीक है।', { speakerName: 'Ramesh', languageCode: 'hi' }),
    ]);

    expect(text).toBe('Siobhan (English): Three hundred platters, please.\nRamesh (Hindi): ठीक है।');
  });

  test('a table’s lines have no speaker', () => {
    const text = formatRecapConversationText([
      createUtterance('Hello.', { speakerName: null, languageCode: null }),
    ]);

    expect(text).toBe('- Hello.');
  });

  test('a very long conversation keeps its most recent part', () => {
    const utterances = Array.from({ length: 400 }, (_, index) =>
      createUtterance(`utterance ${index} ${'word '.repeat(30)}`),
    );

    const text = formatRecapConversationText(utterances);

    expect(text.length).toBeLessThanOrEqual(RECAP_CONVERSATION_MAXIMUM_CHARACTER_COUNT);
    expect(text).toContain('utterance 399');
    expect(text).not.toContain('utterance 0 ');
  });
});
