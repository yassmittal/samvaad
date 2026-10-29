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

function CaptionBubble({
  caption,
  hasVoiceForLanguage,
  onRepeat,
}: { caption: Caption } & SpeechControls) {
  if (!caption.isFinal) {
    return (
      <li className="rounded-2xl border border-dashed border-stone-300 px-4 py-3 text-lg leading-relaxed text-stone-400">
        {caption.text}
      </li>
    );
  }

  const { translation } = caption;
  const translationDelay = translation && formatTranslationDelay(translation);
  const canRepeat =
    translation?.isComplete === true && hasVoiceForLanguage(translation.targetLanguageCode);
  return (
    <li className="flex flex-col gap-1.5 rounded-2xl bg-white px-4 py-3 shadow-sm">
      <p className="leading-relaxed text-stone-500">{caption.text}</p>
      {translation && (
        <p className="text-lg leading-relaxed text-stone-900">
          <span className="sr-only">
            {SUPPORTED_LANGUAGE_BY_CODE[translation.targetLanguageCode].englishName}:{' '}
          </span>
          {translation.text}
        </p>
      )}
      {!translation && !caption.hasTranslationFailed && (
        <p className="animate-pulse text-lg text-stone-300">Translating…</p>
      )}
      {caption.hasTranslationFailed && (
        <p className="text-sm text-rose-600">This sentence couldn’t be translated.</p>
      )}
      {translation && translationDelay && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-stone-400">
            {SUPPORTED_LANGUAGE_BY_CODE[translation.targetLanguageCode].nativeName} ·{' '}
            {translationDelay}
          </p>
          {canRepeat && <RepeatButton onClick={() => onRepeat(caption.utteranceId)} />}
        </div>
      )}
    </li>
  );
}

export function CaptionList({
  captions,
  hasVoiceForLanguage,
  onRepeat,
}: { captions: Caption[] } & SpeechControls) {
  const listEndRef = useRef<HTMLDivElement>(null);
  const latestCaption = captions.at(-1);
  const latestCaptionContent = `${latestCaption?.text}${latestCaption?.translation?.text}`;

  // Keep the newest words in view as they arrive.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the latest caption changes
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [captions.length, latestCaptionContent]);

  if (captions.length === 0) {
    return (
      <p className="m-auto max-w-xs text-center text-stone-400">
        Tap the microphone and speak. What you say appears here with its translation under it, and
        the phone says the translation aloud.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3" aria-live="polite">
      {captions.map((caption) => (
        <CaptionBubble
          key={caption.utteranceId}
          caption={caption}
          hasVoiceForLanguage={hasVoiceForLanguage}
          onRepeat={onRepeat}
        />
      ))}
      <div ref={listEndRef} />
    </ol>
  );
}
