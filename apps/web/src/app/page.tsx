import { ApiStatusPanel } from '@/features/api-status/api-status-panel';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">
          Samvaad <span className="text-stone-400">संवाद</span>
        </h1>
        <p className="text-stone-600">Speak your language. Hear theirs.</p>
      </header>
      <ApiStatusPanel />
    </main>
  );
}
