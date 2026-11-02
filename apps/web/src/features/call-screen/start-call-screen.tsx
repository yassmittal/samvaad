'use client';

import {
  type ConversationContext,
  EMPTY_CONVERSATION_CONTEXT,
  type LanguageCode,
} from '@samvaad/shared';
import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import {
  type ContextDraft,
  createContextDraft,
  parseContextDraft,
} from '../conversation-context/context-draft';
import { ConversationContextEditor } from '../conversation-context/conversation-context-editor';
import {
  findRememberedRoomEntry,
  type RoomEntry,
  roomEntrySchema,
} from '../rooms/remembered-room-entry';
import { CallEntryFields } from './call-entry-fields';
import { PhoneIcon } from './call-icons';
import { CallScreenFrame } from './call-screen-frame';
import { pickDefaultLanguageCode } from './pick-default-language-code';

type StartCallScreenProps = {
  isConnected: boolean;
  /** Called inside the tap, which also opens the microphone (D-022). */
  onStart: (roomEntry: RoomEntry, initialContext: ConversationContext | null) => void;
};

/** Before calling: who you are and what you speak, prefilled from last time (D-022). */
export function StartCallScreen({ isConnected, onStart }: StartCallScreenProps) {
  const [participantName, setParticipantName] = useState('');
  const [languageCode, setLanguageCode] = useState<LanguageCode>('hi');
  const [contextDraft, setContextDraft] = useState<ContextDraft>(() =>
    createContextDraft(EMPTY_CONVERSATION_CONTEXT),
  );
  const [problemText, setProblemText] = useState<string | null>(null);

  // localStorage and navigator only exist in the browser, so read them after the first render.
  useEffect(() => {
    const rememberedRoomEntry = findRememberedRoomEntry();
    setParticipantName(rememberedRoomEntry?.participantName ?? '');
    setLanguageCode(
      pickDefaultLanguageCode({
        rememberedLanguageCode: rememberedRoomEntry?.languageCode ?? null,
        browserLanguageTags: navigator.languages,
        callerLanguageCode: null,
      }),
    );
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const entryParseResult = roomEntrySchema.safeParse({ participantName, languageCode });
    if (!entryParseResult.success) {
      setProblemText(entryParseResult.error.issues[0]?.message ?? 'Check your name.');
      return;
    }
    const contextParseResult = parseContextDraft(contextDraft);
    if (!contextParseResult.isValid) {
      setProblemText(contextParseResult.problemText);
      return;
    }
    setProblemText(null);
    onStart(entryParseResult.data, contextParseResult.context);
  }

  return (
    <CallScreenFrame>
      <form
        onSubmit={handleSubmit}
        className="call-screen-enter flex flex-1 flex-col items-center gap-8"
      >
        <header className="w-full max-w-sm space-y-2">
          <Link href="/" className="text-sm text-call-muted">
            ← Samvaad
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Start a call</h1>
          <p className="text-call-muted">
            You speak your language. They hear theirs. Send them the link once you’re in.
          </p>
        </header>
        <CallEntryFields
          participantName={participantName}
          languageCode={languageCode}
          onParticipantNameChange={setParticipantName}
          onLanguageCodeChange={setLanguageCode}
        />
        <details className="w-full max-w-sm rounded-2xl border border-white/10 bg-call-surface p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Names and terms for the translation <span className="text-call-muted">(optional)</span>
          </summary>
          <div className="pt-4 [&_input]:text-stone-900 [&_textarea]:text-stone-900">
            <ConversationContextEditor draft={contextDraft} onDraftChange={setContextDraft} />
          </div>
        </details>
        <div className="mt-auto flex w-full max-w-sm flex-col items-center gap-3">
          {problemText && (
            <p role="alert" className="text-sm text-call-end">
              {problemText}
            </p>
          )}
          <button
            type="submit"
            disabled={!isConnected}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-call-answer px-6 py-4 text-lg font-medium text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
          >
            <PhoneIcon className="size-5" /> Start call
          </button>
          <p className="text-center text-xs text-call-muted">
            {isConnected
              ? 'Earbuds give the best call. Without them, take turns.'
              : 'Connecting to the server…'}
          </p>
        </div>
      </form>
    </CallScreenFrame>
  );
}
