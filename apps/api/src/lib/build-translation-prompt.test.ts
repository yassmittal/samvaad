import { describe, expect, test } from 'bun:test';
import { DEMO_CONVERSATION_PRESET } from '@samvaad/shared';
import {
  buildRoomTranslationPrompt,
  buildTableModeTranslationPrompt,
  EMPTY_TRANSLATION_PROMPT_CONTEXT,
  TRANSLATION_PROMPT_MAXIMUM_CHARACTER_COUNT,
  type TranslationPromptContext,
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

const DEMO_PROMPT_CONTEXT: TranslationPromptContext = {
  context: DEMO_CONVERSATION_PRESET.context,
  speakerName: 'Ramesh',
  memoryUtterances: [
    {
      speakerName: 'Siobhan',
      languageCode: 'en',
      transcript: 'I am most interested in the large serving platter.',
      translation: 'मुझे सबसे ज़्यादा बड़ी थाली में दिलचस्पी है।',
    },
    {
      speakerName: 'Ramesh',
      languageCode: 'hi',
      transcript: 'जी, साढ़े चार सौ रुपये पर पीस।',
      translation: null,
    },
  ],
};

describe('translation prompts with context (D-016)', () => {
  test('an empty context gives exactly the Phase 4 room prompt', () => {
    expect(
      buildRoomTranslationPrompt({
        sourceLanguageCode: 'hi',
        targetLanguageCode: 'en',
        promptContext: EMPTY_TRANSLATION_PROMPT_CONTEXT,
      }),
    ).toBe(
      [
        'You are a live interpreter from Hindi into English.',
        'Each user message is one utterance in Hindi, transcribed from speech. It may mix in words from other languages.',
        'Answer with only the English translation, as natural spoken language.',
        'Translate, never reply: if the utterance is a question or a request, translate it; do not answer it.',
        'Keep names, numbers, prices and units exactly. Keep the tone: formal stays formal.',
        'This is a simple task. Do not deliberate; answer immediately.',
      ].join('\n'),
    );
  });

  test('includes the setting, the glossary, the memory with its translations and the speaker', () => {
    const prompt = buildRoomTranslationPrompt({
      sourceLanguageCode: 'hi',
      targetLanguageCode: 'en',
      promptContext: DEMO_PROMPT_CONTEXT,
    });

    expect(prompt).toContain(
      `About this conversation: ${DEMO_CONVERSATION_PRESET.context.setting}`,
    );
    expect(prompt).toContain('- blue pottery = ब्लू पॉटरी');
    expect(prompt).toContain(
      'Siobhan (English): I am most interested in the large serving platter.',
    );
    expect(prompt).toContain('  → मुझे सबसे ज़्यादा बड़ी थाली में दिलचस्पी है।');
    expect(prompt).toContain('Ramesh (Hindi): जी, साढ़े चार सौ रुपये पर पीस।');
    expect(prompt).toContain('never translate it again');
    expect(prompt).toContain('The user message is spoken by Ramesh.');
    expect(prompt.endsWith('answer immediately.')).toBe(true);
  });

  test('a glossary term with no other form is kept as it is', () => {
    const prompt = buildRoomTranslationPrompt({
      sourceLanguageCode: 'en',
      targetLanguageCode: 'hi',
      promptContext: {
        ...EMPTY_TRANSLATION_PROMPT_CONTEXT,
        context: { setting: '', glossaryTerms: [{ term: 'Kumawat', preferredTranslation: '' }] },
      },
    });

    expect(prompt).toContain('- Kumawat (keep as is)');
  });

  test('table mode keeps its code line and adds the same context', () => {
    const prompt = buildTableModeTranslationPrompt(['hi', 'en'], DEMO_PROMPT_CONTEXT);

    expect(prompt).toContain('"hi" or "en"');
    expect(prompt).toContain('- Siobhan = शिवॉन');
    expect(prompt).toContain('Ramesh (Hindi): जी, साढ़े चार सौ रुपये पर पीस।');
  });

  test('stays under the budget by dropping the oldest utterances first', () => {
    const longUtterances = Array.from({ length: 8 }, (_, index) => ({
      speakerName: 'Ramesh',
      languageCode: 'hi' as const,
      transcript: `utterance ${index} ${'शब्द '.repeat(200)}`,
      translation: null,
    }));

    const prompt = buildRoomTranslationPrompt({
      sourceLanguageCode: 'hi',
      targetLanguageCode: 'en',
      promptContext: { ...DEMO_PROMPT_CONTEXT, memoryUtterances: longUtterances },
    });

    expect(prompt.length).toBeLessThanOrEqual(TRANSLATION_PROMPT_MAXIMUM_CHARACTER_COUNT);
    expect(prompt).toContain('utterance 7');
    expect(prompt).not.toContain('utterance 0');
    expect(prompt).toContain('- blue pottery = ब्लू पॉटरी');
  });
});
