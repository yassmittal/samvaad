import { type ConversationContext, conversationContextSchema } from '@samvaad/shared';

/** One glossary row as typed, blank or not, with a key for React. */
export type GlossaryRowDraft = { rowId: string; term: string; preferredTranslation: string };

/** The context editor's fields before they are checked and sent (D-016). */
export type ContextDraft = { setting: string; glossaryRows: GlossaryRowDraft[] };

export type ContextDraftParseResult =
  | { isValid: true; context: ConversationContext }
  | { isValid: false; problemText: string };

let nextRowNumber = 0;

export function createGlossaryRowDraft(term = '', preferredTranslation = ''): GlossaryRowDraft {
  nextRowNumber += 1;
  return { rowId: `glossary-row-${nextRowNumber}`, term, preferredTranslation };
}

/** The editor opened on a context: its rows, plus one empty row to type into. */
export function createContextDraft(context: ConversationContext): ContextDraft {
  return {
    setting: context.setting,
    glossaryRows: [
      ...context.glossaryTerms.map(({ term, preferredTranslation }) =>
        createGlossaryRowDraft(term, preferredTranslation),
      ),
      createGlossaryRowDraft(),
    ],
  };
}

/** Rows with no term are left out, so an empty row never blocks saving. */
export function parseContextDraft(draft: ContextDraft): ContextDraftParseResult {
  const parseResult = conversationContextSchema.safeParse({
    setting: draft.setting,
    glossaryTerms: draft.glossaryRows
      .filter((row) => row.term.trim().length > 0)
      .map(({ term, preferredTranslation }) => ({ term, preferredTranslation })),
  });
  if (!parseResult.success) {
    return {
      isValid: false,
      problemText: parseResult.error.issues[0]?.message ?? 'Check the context.',
    };
  }
  return { isValid: true, context: parseResult.data };
}
