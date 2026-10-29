'use client';

import { useEffect, useRef } from 'react';
import type { Caption } from './conversation-reducer';

export function CaptionList({ captions }: { captions: Caption[] }) {
  const listEndRef = useRef<HTMLDivElement>(null);
  const latestCaptionText = captions.at(-1)?.text;

  // Keep the newest words in view as they arrive.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the latest caption changes
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [captions.length, latestCaptionText]);

  if (captions.length === 0) {
    return (
      <p className="m-auto max-w-xs text-center text-stone-400">
        Tap the microphone and speak. What you say appears here as you say it.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3" aria-live="polite">
      {captions.map((caption) => (
        <li
          key={caption.utteranceId}
          className={
            caption.isFinal
              ? 'rounded-2xl bg-white px-4 py-3 text-lg leading-relaxed shadow-sm'
              : 'rounded-2xl border border-dashed border-stone-300 px-4 py-3 text-lg leading-relaxed text-stone-400'
          }
        >
          {caption.text}
        </li>
      ))}
      <div ref={listEndRef} />
    </ol>
  );
}
