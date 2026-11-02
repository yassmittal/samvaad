import Link from 'next/link';
import { CallScreenFrame } from './call-screen-frame';

/** The link's call has ended, or is full (D-022). */
export function CallUnavailableScreen({ text }: { text: string }) {
  return (
    <CallScreenFrame>
      <div className="call-screen-enter flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Call unavailable</h1>
        <p role="alert" className="max-w-xs text-call-muted">
          {text}
        </p>
        {/* A full page load, so the new call starts with a fresh socket and state. */}
        <a
          href="/room/new"
          className="rounded-full bg-call-answer px-6 py-3.5 font-medium text-white hover:brightness-110"
        >
          Start a new call
        </a>
        <Link href="/" className="text-sm text-call-muted underline-offset-4 hover:underline">
          Home
        </Link>
      </div>
    </CallScreenFrame>
  );
}
