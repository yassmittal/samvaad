'use client';

import type { ConversationContext } from '@samvaad/shared';
import { useState } from 'react';
import { type ContextDraft, createContextDraft, parseContextDraft } from './context-draft';
import { ConversationContextEditor } from './conversation-context-editor';

type ConversationContextPanelProps = {
  /** The context as the API last sent it. */
  conversationContext: ConversationContext;
  contextUpdatedByParticipantName: string | null;
  /** A shared room says "for both of you"; a table doesn't. */
  isSharedWithOthers: boolean;
  isDisabled: boolean;
  onSave: (context: ConversationContext) => void;
  onClose: () => void;
};

/** The context editor during a conversation, in a room or at a table (D-016). */
export function ConversationContextPanel({
  conversationContext,
  contextUpdatedByParticipantName,
  isSharedWithOthers,
  isDisabled,
  onSave,
  onClose,
}: ConversationContextPanelProps) {
  // Opened on the current context; a change from the other phone shows the next time it opens.
  const [draft, setDraft] = useState<ContextDraft>(() => createContextDraft(conversationContext));
  const [problemText, setProblemText] = useState<string | null>(null);

  function handleSave(): void {
    const parseResult = parseContextDraft(draft);
    if (!parseResult.isValid) {
      setProblemText(parseResult.problemText);
      return;
    }
    setProblemText(null);
    onSave(parseResult.context);
    onClose();
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-surface p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Context</h2>
        <p className="text-sm text-stone-500">
          Helps the translation get names, products, prices and “it” or “that” right
          {isSharedWithOthers ? ', for both of you' : ''}. Applies from the next sentence.
          {contextUpdatedByParticipantName &&
            ` Last changed by ${contextUpdatedByParticipantName}.`}
        </p>
      </div>
      <ConversationContextEditor draft={draft} onDraftChange={setDraft} />
      {problemText && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {problemText}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-4 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isDisabled}
          className="rounded-full bg-stone-900 px-4 py-1.5 text-sm font-medium text-stone-50 hover:bg-stone-700 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </section>
  );
}

/** The header chip that opens the panel: what context there is, at a glance. */
export function ConversationContextChip({
  conversationContext,
  isOpen,
  onToggle,
}: {
  conversationContext: ConversationContext;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const termCount = conversationContext.glossaryTerms.length;
  const hasContext = conversationContext.setting.length > 0 || termCount > 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className="rounded-full bg-stone-100 px-2.5 py-0.5 text-sm text-stone-700 hover:bg-stone-200"
    >
      {hasContext
        ? `Context · ${termCount} ${termCount === 1 ? 'term' : 'terms'}`
        : '+ Add context'}
    </button>
  );
}
