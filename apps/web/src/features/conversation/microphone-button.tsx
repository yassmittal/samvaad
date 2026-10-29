'use client';

import type { MicrophoneStatus } from '../microphone/use-microphone';

type MicrophoneButtonProps = {
  microphoneStatus: MicrophoneStatus;
  isDisabled: boolean;
  onToggle: () => void;
};

export function MicrophoneButton({
  microphoneStatus,
  isDisabled,
  onToggle,
}: MicrophoneButtonProps) {
  const isOpen = microphoneStatus === 'open';
  const isOpening = microphoneStatus === 'opening';

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isDisabled || isOpening}
      aria-pressed={isOpen}
      aria-label={isOpen ? 'Stop listening' : 'Start listening'}
      className={`relative flex size-20 items-center justify-center rounded-full text-white shadow-lg transition disabled:opacity-40 ${
        isOpen ? 'bg-rose-600' : 'bg-stone-900'
      }`}
    >
      {isOpen && (
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" />
      )}
      <svg aria-hidden viewBox="0 0 24 24" className="relative size-8" fill="currentColor">
        {isOpen ? (
          <rect x="7" y="7" width="10" height="10" rx="2" />
        ) : (
          <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
        )}
      </svg>
    </button>
  );
}
