'use client';

import { type LanguageCode, SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';
import Link from 'next/link';
import { useState } from 'react';
import {
  ConversationContextChip,
  ConversationContextPanel,
} from '../conversation-context/conversation-context-panel';
import { EndConversationButton } from '../recap/end-conversation-button';
import { RecapView } from '../recap/recap-view';
import { CaptionList } from './caption-list';
import { isWaitingForTranslation } from './conversation-reducer';
import { ConversationStatus } from './conversation-status';
import { LanguagePairPicker } from './language-pair-picker';
import { LatencyMeter } from './latency-meter';
import { MicrophoneButton } from './microphone-button';
import { useScreenWakeLock } from './use-screen-wake-lock';
import { type LanguagePair, useTableConversation } from './use-table-conversation';

function NoVoiceNotice({
  languagePair,
  hasVoiceForLanguage,
}: {
  languagePair: LanguagePair;
  hasVoiceForLanguage: (languageCode: LanguageCode) => boolean;
}) {
  const unspokenLanguageNames = languagePair
    .filter((languageCode) => !hasVoiceForLanguage(languageCode))
    .map((languageCode) => SUPPORTED_LANGUAGE_BY_CODE[languageCode].englishName);
  if (unspokenLanguageNames.length === 0) {
    return null;
  }
  return (
    <p className="text-sm text-amber-700 dark:text-amber-400">
      Captions only for {unspokenLanguageNames.join(' and ')} on this phone: it has no voice for{' '}
      {unspokenLanguageNames.length === 1 ? 'it' : 'them'}.
    </p>
  );
}

export function TableConversation() {
  const {
    captions,
    latestError,
    conversationContext,
    recap,
    socketStatus,
    microphoneStatus,
    isSpeaking,
    hasVoiceForLanguage,
    languagePair,
    changeLanguagePair,
    toggleMicrophone,
    repeatTranslation,
    updateConversationContext,
    endConversation,
    dismissRecap,
    retryConnection,
  } = useTableConversation();
  const [isContextOpen, setIsContextOpen] = useState(false);
  useScreenWakeLock();
  const isConnected = socketStatus === 'open';
  const hasFinishedUtterance = captions.some((caption) => caption.isFinal);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-xl flex-col">
      <header className="flex flex-col gap-4 border-b border-stone-200 px-4 pb-4 pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <Link href="/" className="whitespace-nowrap text-xl font-semibold tracking-tight">
            Samvaad <span className="text-sm font-normal text-stone-500">Table mode</span>
          </Link>
          <LatencyMeter captions={captions} />
        </div>
        <div>
          <ConversationContextChip
            conversationContext={conversationContext}
            isOpen={isContextOpen}
            onToggle={() => setIsContextOpen((isOpen) => !isOpen)}
          />
        </div>
        <LanguagePairPicker
          languagePair={languagePair}
          isDisabled={!isConnected || microphoneStatus === 'open'}
          onChange={changeLanguagePair}
        />
        <NoVoiceNotice languagePair={languagePair} hasVoiceForLanguage={hasVoiceForLanguage} />
      </header>

      <section className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {recap !== null ? (
          <RecapView
            recap={recap}
            languageCodes={languagePair}
            isConnected={isConnected}
            onRetry={endConversation}
            onBack={dismissRecap}
          />
        ) : (
          <>
            {isContextOpen && (
              <ConversationContextPanel
                conversationContext={conversationContext}
                contextUpdatedByParticipantName={null}
                isSharedWithOthers={false}
                isDisabled={!isConnected}
                onSave={updateConversationContext}
                onClose={() => setIsContextOpen(false)}
              />
            )}
            <CaptionList
              captions={captions}
              listenerLanguageCode={null}
              emptyStateText="Tap the microphone and speak. What you say appears here with its translation under it, and the phone says the translation aloud."
              hasVoiceForLanguage={hasVoiceForLanguage}
              onRepeat={repeatTranslation}
            />
          </>
        )}
      </section>

      {recap === null && (
        <footer className="flex flex-col items-center gap-3 border-t border-stone-200 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          <ConversationStatus
            socketStatus={socketStatus}
            microphoneStatus={microphoneStatus}
            isSpeaking={isSpeaking}
            isTranslating={isWaitingForTranslation(captions, null)}
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
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
            <div className="justify-self-start">
              <EndConversationButton
                isDisabled={!isConnected || !hasFinishedUtterance}
                isSharedWithOthers={false}
                onEnd={endConversation}
              />
            </div>
            <MicrophoneButton
              microphoneStatus={microphoneStatus}
              isSpeaking={isSpeaking}
              isDisabled={!isConnected}
              onToggle={() => void toggleMicrophone()}
            />
            <span />
          </div>
        </footer>
      )}
    </main>
  );
}
