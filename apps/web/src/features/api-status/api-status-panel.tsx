'use client';

import { webEnv } from '@/config/env';
import { type CheckResult, useApiStatus } from './use-api-status';

const RESULT_LABEL = {
  checking: 'checking…',
  ok: 'ok',
  failed: 'unreachable',
} as const satisfies Record<CheckResult['state'], string>;

const RESULT_DOT_CLASS = {
  checking: 'bg-amber-400 animate-pulse',
  ok: 'bg-emerald-500',
  failed: 'bg-rose-500',
} as const satisfies Record<CheckResult['state'], string>;

function StatusRow({ name, result }: { name: string; result: CheckResult }) {
  return (
    <li className="flex items-start gap-3 py-4">
      <span
        aria-hidden
        className={`mt-1.5 size-2.5 shrink-0 rounded-full ${RESULT_DOT_CLASS[result.state]}`}
      />
      <div className="min-w-0">
        <p className="font-medium">
          {name} {RESULT_LABEL[result.state]}
        </p>
        {result.state !== 'checking' && (
          <p className="break-words text-sm text-stone-500">{result.detail}</p>
        )}
      </div>
    </li>
  );
}

export function ApiStatusPanel() {
  const { healthResult, socketResult, runChecks } = useApiStatus();
  const isChecking = healthResult.state === 'checking' || socketResult.state === 'checking';

  return (
    <section className="w-full rounded-2xl border border-stone-200 bg-white px-5 shadow-sm">
      <ul className="divide-y divide-stone-100" aria-live="polite">
        <StatusRow name="API" result={healthResult} />
        <StatusRow name="WebSocket" result={socketResult} />
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-stone-100 py-3">
        <code className="truncate text-xs text-stone-400">{webEnv.NEXT_PUBLIC_API_BASE_URL}</code>
        <button
          type="button"
          onClick={runChecks}
          disabled={isChecking}
          className="shrink-0 rounded-full bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
        >
          Check again
        </button>
      </div>
    </section>
  );
}
