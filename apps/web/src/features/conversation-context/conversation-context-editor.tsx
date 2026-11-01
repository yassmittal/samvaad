'use client';

import {
  DEMO_CONVERSATION_PRESET,
  MAXIMUM_GLOSSARY_TERM_COUNT,
  MAXIMUM_GLOSSARY_TERM_LENGTH,
  MAXIMUM_SETTING_LENGTH,
} from '@samvaad/shared';
import {
  type ContextDraft,
  createContextDraft,
  createGlossaryRowDraft,
  type GlossaryRowDraft,
} from './context-draft';

type ConversationContextEditorProps = {
  draft: ContextDraft;
  onDraftChange: (draft: ContextDraft) => void;
};

const INPUT_CLASS_NAME =
  'min-w-0 flex-1 rounded-xl border border-stone-200 bg-surface px-3 py-2 text-base';

/**
 * "What's this conversation about?" and a glossary: a term, and how it is said in the other
 * language (D-016). Both help Muse Spark; the glossary also helps the transcriber hear names.
 */
export function ConversationContextEditor({
  draft,
  onDraftChange,
}: ConversationContextEditorProps) {
  function updateGlossaryRow(rowId: string, update: Partial<GlossaryRowDraft>): void {
    onDraftChange({
      ...draft,
      glossaryRows: draft.glossaryRows.map((row) =>
        row.rowId === rowId ? { ...row, ...update } : row,
      ),
    });
  }

  function removeGlossaryRow(rowId: string): void {
    onDraftChange({
      ...draft,
      glossaryRows: draft.glossaryRows.filter((row) => row.rowId !== rowId),
    });
  }

  function addGlossaryRow(): void {
    onDraftChange({ ...draft, glossaryRows: [...draft.glossaryRows, createGlossaryRowDraft()] });
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => onDraftChange(createContextDraft(DEMO_CONVERSATION_PRESET.context))}
        className="self-start rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
      >
        Use the demo: {DEMO_CONVERSATION_PRESET.presetName}
      </button>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
          What's this conversation about?
        </span>
        <textarea
          value={draft.setting}
          onChange={(event) => onDraftChange({ ...draft, setting: event.target.value })}
          maxLength={MAXIMUM_SETTING_LENGTH}
          rows={3}
          placeholder="Who is talking, about what. For example: an exporter and a buyer agreeing an order; prices in rupees."
          className="rounded-xl border border-stone-200 bg-surface px-3 py-2 text-base"
        />
      </label>

      {/* A fieldset is as wide as its content by default; min-w-0 lets the rows shrink on a phone. */}
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
          Glossary: names and terms
        </legend>
        <p className="text-sm text-stone-500">
          A term, and how it's said in the other language. Leave the second box empty to keep it as
          it is, as for a name.
        </p>
        {draft.glossaryRows.map((row) => (
          <div key={row.rowId} className="flex items-center gap-2">
            <input
              value={row.term}
              onChange={(event) => updateGlossaryRow(row.rowId, { term: event.target.value })}
              maxLength={MAXIMUM_GLOSSARY_TERM_LENGTH}
              placeholder="Term"
              aria-label="Term"
              className={INPUT_CLASS_NAME}
            />
            <input
              value={row.preferredTranslation}
              onChange={(event) =>
                updateGlossaryRow(row.rowId, { preferredTranslation: event.target.value })
              }
              maxLength={MAXIMUM_GLOSSARY_TERM_LENGTH}
              placeholder="In the other language"
              aria-label="In the other language"
              className={INPUT_CLASS_NAME}
            />
            <button
              type="button"
              onClick={() => removeGlossaryRow(row.rowId)}
              aria-label={`Remove ${row.term || 'this row'}`}
              className="rounded-full px-2 py-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            >
              ×
            </button>
          </div>
        ))}
        {draft.glossaryRows.length < MAXIMUM_GLOSSARY_TERM_COUNT && (
          <button
            type="button"
            onClick={addGlossaryRow}
            className="self-start rounded-full px-3 py-1 text-sm font-medium text-stone-600 hover:bg-stone-100"
          >
            + Add a term
          </button>
        )}
      </fieldset>
    </div>
  );
}
