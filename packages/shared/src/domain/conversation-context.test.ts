import { describe, expect, test } from 'bun:test';
import { clientMessageSchema } from '../protocol/client-messages';
import {
  conversationContextSchema,
  EMPTY_CONVERSATION_CONTEXT,
  isConversationContextEmpty,
  MAXIMUM_GLOSSARY_TERM_COUNT,
  MAXIMUM_SETTING_LENGTH,
} from './conversation-context';
import { DEMO_CONVERSATION_PRESET } from './demo-conversation-preset';

describe('conversationContextSchema', () => {
  test('trims the setting and the glossary, and allows a blank preferred translation', () => {
    const context = conversationContextSchema.parse({
      setting: '  An order of blue pottery.  ',
      glossaryTerms: [{ term: ' Siobhan ', preferredTranslation: '  ' }],
    });

    expect(context).toEqual({
      setting: 'An order of blue pottery.',
      glossaryTerms: [{ term: 'Siobhan', preferredTranslation: '' }],
    });
  });

  test('rejects a blank term', () => {
    const result = conversationContextSchema.safeParse({
      setting: '',
      glossaryTerms: [{ term: '   ', preferredTranslation: 'ब्लू पॉटरी' }],
    });

    expect(result.success).toBe(false);
  });

  test('keeps the setting and the glossary within their limits', () => {
    const tooLongSetting = 'a'.repeat(MAXIMUM_SETTING_LENGTH + 1);
    const tooManyTerms = Array.from({ length: MAXIMUM_GLOSSARY_TERM_COUNT + 1 }, (_, index) => ({
      term: `term ${index}`,
      preferredTranslation: '',
    }));

    expect(
      conversationContextSchema.safeParse({ setting: tooLongSetting, glossaryTerms: [] }).success,
    ).toBe(false);
    expect(
      conversationContextSchema.safeParse({ setting: '', glossaryTerms: tooManyTerms }).success,
    ).toBe(false);
  });

  test('accepts the demo preset', () => {
    expect(conversationContextSchema.safeParse(DEMO_CONVERSATION_PRESET.context).success).toBe(
      true,
    );
  });

  test('knows an empty context', () => {
    expect(isConversationContextEmpty(EMPTY_CONVERSATION_CONTEXT)).toBe(true);
    expect(isConversationContextEmpty(DEMO_CONVERSATION_PRESET.context)).toBe(false);
  });
});

describe('the Phase 5 client messages', () => {
  test('accepts update_conversation_context and end_conversation', () => {
    expect(
      clientMessageSchema.safeParse({
        type: 'update_conversation_context',
        ...DEMO_CONVERSATION_PRESET.context,
      }).success,
    ).toBe(true);
    expect(clientMessageSchema.safeParse({ type: 'end_conversation' }).success).toBe(true);
  });
});
