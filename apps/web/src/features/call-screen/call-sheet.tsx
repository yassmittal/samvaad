'use client';

import { type ReactNode, useEffect } from 'react';
import { CloseIcon } from './call-icons';

type CallSheetProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/** A sheet that slides up over the call: the transcript, the context, the recap (D-022). */
export function CallSheet({ title, onClose, children }: CallSheetProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="call-backdrop-enter absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal
        aria-label={title}
        className="call-sheet-enter relative flex max-h-[88dvh] w-full max-w-xl flex-col rounded-t-3xl bg-stone-50 text-stone-900 shadow-2xl"
      >
        <header className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 rounded-full p-2 text-stone-500 hover:bg-stone-200"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </section>
    </div>
  );
}
