'use client';

import type { MicrophoneStatus } from '../microphone/use-microphone';

type MicrophoneButtonProps = {
  microphoneStatus: MicrophoneStatus;
  /** The phone is saying a translation, so the microphone is paused. */
  isSpeaking: boolean;
  isDisabled: boolean;
  onToggle: () => void;
};

export function MicrophoneButton({
  microphoneStatus,
  isSpeaking,
  isDisabled,
  onToggle,
}: MicrophoneButtonProps) {
  const isOpen = microphoneStatus === 'open';
  const isOpening = microphoneStatus === 'opening';
  const backgroundClassName = isSpeaking
    ? 'bg-indigo-600'
    : isOpen
      ? 'bg-rose-600'
      : 'bg-stone-900';

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isDisabled || isOpening}
      aria-pressed={isOpen}
      aria-label={isOpen ? 'Stop listening' : 'Start listening'}
      className={`relative flex size-20 items-center justify-center rounded-full text-white shadow-lg transition disabled:opacity-40 ${backgroundClassName}`}
    >
      {isOpen && !isSpeaking && (
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" />
      )}
      {isSpeaking && (
        <span
          aria-hidden
          className="absolute inset-0 animate-pulse rounded-full bg-indigo-400/40"
        />
      )}
      <svg aria-hidden viewBox="0 0 24 24" className="relative size-8" fill="currentColor">
        {isSpeaking ? (
          <path d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.48 4.48 0 0 0 16.5 12ZM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23Z" />
        ) : isOpen ? (
          <rect x="7" y="7" width="10" height="10" rx="2" />
        ) : (
          <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
        )}
      </svg>
    </button>
  );
}
