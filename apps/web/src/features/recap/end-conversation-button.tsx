'use client';

import { useState } from 'react';

type EndConversationButtonProps = {
  /** Nothing said yet means nothing to recap. */
  isDisabled: boolean;
  /** A room ends for both phones (D-016), so the confirmation says so. */
  isSharedWithOthers: boolean;
  onEnd: () => void;
};

/** Two taps, because ending takes the other phone to the recap too. */
export function EndConversationButton({
  isDisabled,
  isSharedWithOthers,
  onEnd,
}: EndConversationButtonProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (isConfirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setIsConfirming(false);
            onEnd();
          }}
          className="rounded-full bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
        >
          {isSharedWithOthers ? 'End for both' : 'End'}
        </button>
        <button
          type="button"
          onClick={() => setIsConfirming(false)}
          className="rounded-full px-2 py-1.5 text-sm text-stone-500 hover:bg-stone-100"
        >
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setIsConfirming(true)}
      disabled={isDisabled}
      className="rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-40"
    >
      End &amp; recap
    </button>
  );
}
