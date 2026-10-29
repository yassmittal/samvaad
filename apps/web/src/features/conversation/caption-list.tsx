'use client';

import { type LanguageCode, SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';
import { useEffect, useRef } from 'react';
import type { Caption, CaptionTranslation } from './conversation-reducer';
import { formatSeconds } from './format-seconds';

type SpeechControls = {
  hasVoiceForLanguage: (languageCode: LanguageCode) => boolean;
  onRepeat: (utteranceId: string) => void;
};

function formatTranslationDelay(translation: CaptionTranslation): string | null {
  if (translation.speechEndToPlaybackStartMilliseconds !== null) {
    return `spoken after ${formatSeconds(translation.speechEndToPlaybackStartMilliseconds)}`;
  }
  if (translation.speechEndToTranslationCompleteMilliseconds !== null) {
    return `translated in ${formatSeconds(translation.speechEndToTranslationCompleteMilliseconds)}`;
  }
  return null;
}

function RepeatButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Say it again"
      title="Say it again"
      className="-my-1 -mr-2 shrink-0 rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="currentColor">
        <path d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.48 4.48 0 0 0 16.5 12ZM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23Z" />
      </svg>
    </button>
  );
}

function TranslationFooter({
  caption,
  translation,
  hasVoiceForLanguage,
  onRepeat,
}: { caption: Caption; translation: CaptionTranslation } & SpeechControls) {
  const translationDelay = formatTranslationDelay(translation);
  if (!translationDelay) {
    return null;
  }
  const canRepeat = translation.isComplete && hasVoiceForLanguage(translation.targetLanguageCode);
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-stone-400">
        {SUPPORTED_LANGUAGE_BY_CODE[translation.targetLanguageCode].nativeName} · {translationDelay}
      </p>
      {canRepeat && <RepeatButton onClick={() => onRepeat(caption.utteranceId)} />}
    </div>
  );
}

function TranslationText({ translation }: { translation: CaptionTranslation }) {
  return (
    <p className="text-lg leading-relaxed text-stone-900">
      <span className="sr-only">
        {SUPPORTED_LANGUAGE_BY_CODE[translation.targetLanguageCode].englishName}:{' '}
      </span>
      {translation.text}
    </p>
  );
}

function TranslationFailure() {
  return <p className="text-sm text-rose-600">This sentence couldn’t be translated.</p>;
}

/** Before the first words arrive. A stream that breaks later keeps its words and says so. */
function TranslationPending({ caption }: { caption: Caption }) {
  if (caption.hasTranslationFailed) {
    return <TranslationFailure />;
  }
  return <p className="animate-pulse text-lg text-stone-300">Translating…</p>;
}

/** Table mode: both people read one phone, so every bubble has the transcript and its translation. */
function TableCaptionBubble({ caption, ...speechControls }: { caption: Caption } & SpeechControls) {
  const { translation } = caption;
  return (
    <li className="flex flex-col gap-1.5 rounded-2xl bg-white px-4 py-3 shadow-sm">
      <p className="leading-relaxed text-stone-500">{caption.text}</p>
      {translation ? (
        <>
          <TranslationText translation={translation} />
          {caption.hasTranslationFailed && <TranslationFailure />}
          <TranslationFooter caption={caption} translation={translation} {...speechControls} />
        </>
      ) : (
        <TranslationPending caption={caption} />
      )}
    </li>
  );
}

/** A room, my own utterance: the other phone gets the translation, I only see what I said. */
function OwnCaptionBubble({ caption }: { caption: Caption }) {
  return (
    <li className="ml-10 self-end rounded-2xl bg-stone-900 px-4 py-3 text-lg leading-relaxed text-white shadow-sm">
      {caption.text}
    </li>
  );
}

/** A room, someone else's utterance: the translation big, their original small. */
function TheirCaptionBubble({
  caption,
  listenerLanguageCode,
  ...speechControls
}: { caption: Caption; listenerLanguageCode: LanguageCode } & SpeechControls) {
  const { translation } = caption;
  // Spoken in my language: no translation is coming, the transcript is it.
  if (caption.languageCode === listenerLanguageCode) {
    return (
      <li className="mr-10 rounded-2xl bg-white px-4 py-3 text-lg leading-relaxed text-stone-900 shadow-sm">
        {caption.text}
      </li>
    );
  }
  return (
    <li className="mr-10 flex flex-col gap-1.5 rounded-2xl bg-white px-4 py-3 shadow-sm">
      {translation ? (
        <TranslationText translation={translation} />
      ) : (
        <TranslationPending caption={caption} />
      )}
      {translation && caption.hasTranslationFailed && <TranslationFailure />}
      <p className="text-sm leading-relaxed text-stone-500">{caption.text}</p>
      {translation && (
        <TranslationFooter caption={caption} translation={translation} {...speechControls} />
      )}
    </li>
  );
}

function CaptionBubble({
  caption,
  listenerLanguageCode,
  ...speechControls
}: { caption: Caption; listenerLanguageCode: LanguageCode | null } & SpeechControls) {
  const isRoom = listenerLanguageCode !== null;
  if (!caption.isFinal) {
    return (
      <li
        className={`rounded-2xl border border-dashed border-stone-300 px-4 py-3 text-lg leading-relaxed text-stone-400 ${isRoom ? 'ml-10 self-end' : ''}`}
      >
        {caption.text}
      </li>
    );
  }
  if (!isRoom) {
    return <TableCaptionBubble caption={caption} {...speechControls} />;
  }
  if (caption.isOwnUtterance) {
    return <OwnCaptionBubble caption={caption} />;
  }
  return (
    <TheirCaptionBubble
      caption={caption}
      listenerLanguageCode={listenerLanguageCode}
      {...speechControls}
    />
  );
}

type CaptionListProps = {
  captions: Caption[];
  /** This phone's language in a room; `null` in table mode, where the phone hears both. */
  listenerLanguageCode: LanguageCode | null;
  emptyStateText: string;
} & SpeechControls;

export function CaptionList({
  captions,
  listenerLanguageCode,
  emptyStateText,
  hasVoiceForLanguage,
  onRepeat,
}: CaptionListProps) {
  const listEndRef = useRef<HTMLDivElement>(null);
  const latestCaption = captions.at(-1);
  const latestCaptionContent = `${latestCaption?.text}${latestCaption?.translation?.text}`;

  // Keep the newest words in view as they arrive.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the latest caption changes
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [captions.length, latestCaptionContent]);

  if (captions.length === 0) {
    return <p className="m-auto max-w-xs text-center text-stone-400">{emptyStateText}</p>;
  }

  return (
    <ol className="flex flex-col gap-3" aria-live="polite">
      {captions.map((caption) => (
        <CaptionBubble
          key={caption.utteranceId}
          caption={caption}
          listenerLanguageCode={listenerLanguageCode}
          hasVoiceForLanguage={hasVoiceForLanguage}
          onRepeat={onRepeat}
        />
      ))}
      <div ref={listEndRef} />
    </ol>
  );
}
