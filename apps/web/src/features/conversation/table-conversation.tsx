'use client';

import Link from 'next/link';
import { CaptionList } from './caption-list';
import { ConversationStatus } from './conversation-status';
import { LanguagePairPicker } from './language-pair-picker';
import { MicrophoneButton } from './microphone-button';
import { useTableConversation } from './use-table-conversation';

export function TableConversation() {
  const {
    captions,
    latestError,
    socketStatus,
    microphoneStatus,
    languagePair,
    changeLanguagePair,
    toggleMicrophone,
    retryConnection,
  } = useTableConversation();
  const isConnected = socketStatus === 'open';

  return (
    <main className="mx-auto flex h-dvh w-full max-w-xl flex-col">
      <header className="flex flex-col gap-4 border-b border-stone-200 px-4 pb-4 pt-5">
        <div className="flex items-baseline justify-between">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Samvaad
          </Link>
          <span className="text-sm text-stone-500">Table mode</span>
        </div>
        <LanguagePairPicker
          languagePair={languagePair}
          isDisabled={!isConnected || microphoneStatus === 'open'}
          onChange={changeLanguagePair}
        />
      </header>

      <section className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
        <CaptionList captions={captions} />
      </section>

      <footer className="flex flex-col items-center gap-3 border-t border-stone-200 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <ConversationStatus
          socketStatus={socketStatus}
          microphoneStatus={microphoneStatus}
          latestError={latestError}
        />
        {socketStatus === 'closed' && (
          <button
            type="button"
            onClick={retryConnection}
            className="rounded-full bg-stone-200 px-4 py-1.5 text-sm font-medium hover:bg-stone-300"
          >
            Try again
          </button>
        )}
        <MicrophoneButton
          microphoneStatus={microphoneStatus}
          isDisabled={!isConnected}
          onToggle={() => void toggleMicrophone()}
        />
      </footer>
    </main>
  );
}
