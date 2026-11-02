import Link from 'next/link';
import { ApiStatusPanel } from '@/features/api-status/api-status-panel';
import { PhoneIcon } from '@/features/call-screen/call-icons';
import { CallScreenFrame } from '@/features/call-screen/call-screen-frame';
import { HomeOrb } from '@/features/call-screen/home-orb';
import { JoinRoomForm } from '@/features/rooms/join-room-form';

export default function HomePage() {
  return (
    <CallScreenFrame>
      <div className="call-screen-enter flex flex-1 flex-col">
        <header className="flex flex-col items-center gap-8 pt-10 text-center">
          <HomeOrb />
          <div className="space-y-3">
            <h1 className="text-5xl font-semibold tracking-tight">
              Samvaad <span className="text-call-muted">संवाद</span>
            </h1>
            <p className="mx-auto max-w-xs text-lg text-call-muted">
              Call anyone. You speak your language, they hear theirs.
            </p>
          </div>
        </header>

        <section className="mt-auto flex flex-col gap-5 pt-10">
          <Link
            href="/room/new"
            className="flex items-center justify-center gap-2 rounded-full bg-call-answer px-6 py-4 text-lg font-medium text-white transition hover:brightness-110 active:scale-[0.98]"
          >
            <PhoneIcon className="size-5" /> Start a call
          </Link>
          <JoinRoomForm />
          <Link
            href="/table"
            className="text-center text-sm text-call-muted underline-offset-4 hover:underline"
          >
            Sitting together? Use one phone on the table
          </Link>
          <ApiStatusPanel />
        </section>
      </div>
    </CallScreenFrame>
  );
}
