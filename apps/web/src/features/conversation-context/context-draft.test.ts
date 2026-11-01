import { describe, expect, test } from 'bun:test';
import { DEMO_CONVERSATION_PRESET, MAXIMUM_SETTING_LENGTH } from '@samvaad/shared';
import { createContextDraft, createGlossaryRowDraft, parseContextDraft } from './context-draft';

describe('context drafts', () => {
  test('a context round-trips through the editor, with one empty row added', () => {
    const draft = createContextDraft(DEMO_CONVERSATION_PRESET.context);

    expect(draft.glossaryRows).toHaveLength(
      DEMO_CONVERSATION_PRESET.context.glossaryTerms.length + 1,
    );
    expect(parseContextDraft(draft)).toEqual({
      isValid: true,
      context: DEMO_CONVERSATION_PRESET.context,
    });
  });

  test('rows without a term are left out, even with a translation typed', () => {
    const parseResult = parseContextDraft({
      setting: '',
      glossaryRows: [createGlossaryRowDraft('  ', 'ब्लू पॉटरी'), createGlossaryRowDraft('Kumawat')],
    });

    expect(parseResult).toEqual({
      isValid: true,
      context: { setting: '', glossaryTerms: [{ term: 'Kumawat', preferredTranslation: '' }] },
    });
  });

  test('a setting over the limit says why', () => {
    const parseResult = parseContextDraft({
      setting: 'a'.repeat(MAXIMUM_SETTING_LENGTH + 1),
      glossaryRows: [],
    });

    expect(parseResult.isValid).toBe(false);
  });

  test('every row gets its own key', () => {
    expect(createGlossaryRowDraft().rowId).not.toBe(createGlossaryRowDraft().rowId);
  });
});
