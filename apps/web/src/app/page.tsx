import Link from 'next/link';
import { ApiStatusPanel } from '@/features/api-status/api-status-panel';
import { JoinRoomForm } from '@/features/rooms/join-room-form';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">
          Samvaad <span className="text-stone-400">संवाद</span>
        </h1>
        <p className="text-stone-600">Speak your language. Hear theirs.</p>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-medium">Talk on two phones</h2>
            <p className="text-sm text-stone-500">
              Each of you speaks into your own phone and hears the other in your own language.
              Earbuds recommended.
            </p>
          </div>
          <Link
            href="/room/new"
            className="rounded-xl bg-stone-900 px-4 py-2.5 text-center font-medium text-white transition hover:bg-stone-700"
          >
            Start a room
          </Link>
          <JoinRoomForm />
        </div>

        <Link
          href="/table"
          className="rounded-2xl border border-stone-200 bg-white px-5 py-4 transition hover:bg-stone-100"
        >
          <span className="block text-lg font-medium">Table mode</span>
          <span className="block text-sm text-stone-500">
            One phone between two people. Each speaks their own language.
          </span>
        </Link>
      </section>

      <ApiStatusPanel />
    </main>
  );
}
