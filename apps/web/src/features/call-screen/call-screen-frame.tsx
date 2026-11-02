import type { ReactNode } from 'react';

/**
 * The dark, phone-shaped page every call screen sits in (D-022): full height on a phone, a
 * centred column on a laptop, clear of the notch and the home bar.
 */
export function CallScreenFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-call-background text-call-text">
      <main className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        {/* A soft glow behind everything, so the black isn't flat. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-[radial-gradient(closest-side,rgb(255_255_255/0.07),transparent)]"
        />
        <div className="relative flex flex-1 flex-col">{children}</div>
      </main>
    </div>
  );
}
