'use client';

import { SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';
import { useEffect, useRef } from 'react';
import type { Caption } from './conversation-reducer';
import { formatSeconds } from './format-seconds';

function CaptionBubble({ caption }: { caption: Caption }) {
  if (!caption.isFinal) {
    return (
      <li className="rounded-2xl border border-dashed border-stone-300 px-4 py-3 text-lg leading-relaxed text-stone-400">
        {caption.text}
      </li>
    );
  }

  const { translation } = caption;
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
      {translation?.speechEndToTranslationCompleteMilliseconds != null && (
        <p className="text-xs text-stone-400">
          {SUPPORTED_LANGUAGE_BY_CODE[translation.targetLanguageCode].nativeName} · translated in{' '}
          {formatSeconds(translation.speechEndToTranslationCompleteMilliseconds)}
        </p>
      )}
    </li>
  );
}

export function CaptionList({ captions }: { captions: Caption[] }) {
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
        Tap the microphone and speak. What you say appears here, with its translation under it.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3" aria-live="polite">
      {captions.map((caption) => (
        <CaptionBubble key={caption.utteranceId} caption={caption} />
      ))}
      <div ref={listEndRef} />
    </ol>
  );
}
