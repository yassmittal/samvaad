'use client';

import { type LanguageCode, SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ConversationRecap } from '../conversation/conversation-reducer';

const COPIED_NOTICE_DURATION_MILLISECONDS = 2000;
const RECAP_ITEM_PREFIX = '- ';

function RecapCard({ text, heading }: { text: string; heading: string | null }) {
  const [hasCopied, setHasCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  // `navigator.share` only exists in the browser, and only on some of them.
  useEffect(() => setCanShare(typeof navigator.share === 'function'), []);

  async function copyRecap(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), COPIED_NOTICE_DURATION_MILLISECONDS);
    } catch (error) {
      console.warn('could not copy the recap', error);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-surface p-4">
      {heading && (
        <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">{heading}</h3>
      )}
      <div className="flex flex-col gap-1 text-lg leading-relaxed text-stone-900">
        {/* The recap is plain text: headings on their own lines, items starting "- " (D-016). */}
        {text.split('\n').map((line, lineIndex) =>
          line.startsWith(RECAP_ITEM_PREFIX) ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines are static and may repeat
            <p key={lineIndex} className="pl-1">
              {line}
            </p>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines are static and may repeat
            <p key={lineIndex} className="pt-2 font-semibold first:pt-0">
              {line}
            </p>
          ),
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void copyRecap()}
          className="rounded-full bg-stone-100 px-4 py-1.5 text-sm font-medium hover:bg-stone-200"
        >
          {hasCopied ? 'Copied' : 'Copy'}
        </button>
        {canShare && (
          <button
            type="button"
            onClick={() => navigator.share({ title: 'Samvaad recap', text }).catch(() => {})}
            className="rounded-full bg-stone-100 px-4 py-1.5 text-sm font-medium hover:bg-stone-200"
          >
            Share…
          </button>
        )}
      </div>
    </article>
  );
}

type RecapViewProps = {
  recap: ConversationRecap;
  /** The languages this phone listens in: one in a room, two at a table. */
  languageCodes: readonly LanguageCode[];
  isConnected: boolean;
  onRetry: () => void;
  onBack: () => void;
  /** Leaves the room. A table needs nothing: leaving the page closes its socket. */
  onExit?: () => void;
};

/** The end of the conversation: what was agreed, in this phone's language(s) (D-016). */
export function RecapView({
  recap,
  languageCodes,
  isConnected,
  onRetry,
  onBack,
  onExit,
}: RecapViewProps) {
  const writtenLanguageCodes = languageCodes.filter(
    (languageCode) => recap.recapTextsByLanguageCode[languageCode] !== undefined,
  );
  const isWriting = writtenLanguageCodes.length < languageCodes.length && !recap.hasFailed;

  return (
    <section className="flex flex-col gap-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Recap</h2>
        <p className="text-stone-500">
          {recap.endedByParticipantName
            ? `${recap.endedByParticipantName} ended the conversation.`
            : 'The conversation has ended.'}
        </p>
      </div>

      {writtenLanguageCodes.map((languageCode) => (
        <RecapCard
          key={languageCode}
          text={recap.recapTextsByLanguageCode[languageCode] ?? ''}
          heading={
            languageCodes.length > 1 ? SUPPORTED_LANGUAGE_BY_CODE[languageCode].englishName : null
          }
        />
      ))}
      {isWriting && (
        <p className="animate-pulse text-stone-500">Writing the recap with Muse Spark…</p>
      )}
      {recap.hasFailed && (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-rose-600 dark:text-rose-400">
            The recap could not be written.
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={!isConnected}
            className="rounded-full bg-stone-200 px-4 py-1.5 text-sm font-medium hover:bg-stone-300 disabled:opacity-40"
          >
            Try again
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-2xl bg-stone-900 px-5 py-3 font-medium text-stone-50 hover:bg-stone-700"
        >
          Back to the conversation
        </button>
        <Link
          href="/"
          onClick={() => onExit?.()}
          className="rounded-2xl px-5 py-3 font-medium text-stone-600 hover:bg-stone-100"
        >
          Leave
        </Link>
      </div>
    </section>
  );
}
