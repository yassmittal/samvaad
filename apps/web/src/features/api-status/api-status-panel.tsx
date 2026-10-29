'use client';

import { webEnv } from '@/config/env';
import { type CheckResult, useApiStatus } from './use-api-status';

const RESULT_LABEL = {
  checking: 'Checking the server…',
  ok: 'Server ok',
  failed: 'Server unreachable',
} as const satisfies Record<CheckResult['state'], string>;

const RESULT_DOT_CLASS = {
  checking: 'bg-amber-400 animate-pulse',
  ok: 'bg-emerald-500',
  failed: 'bg-rose-500',
} as const satisfies Record<CheckResult['state'], string>;

export function ApiStatusPanel() {
  const { healthResult, runCheck } = useApiStatus();

  return (
    <section className="flex w-full flex-col gap-4">
      <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-4">
        <span
          aria-hidden
          className={`mt-1.5 size-2.5 shrink-0 rounded-full ${RESULT_DOT_CLASS[healthResult.state]}`}
        />
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="font-medium">{RESULT_LABEL[healthResult.state]}</p>
          <p className="break-words text-sm text-stone-500">
            {healthResult.state === 'checking' ? (
              <code className="text-xs">{webEnv.NEXT_PUBLIC_API_BASE_URL}</code>
            ) : (
              healthResult.detail
            )}
          </p>
        </div>
        {healthResult.state === 'failed' && (
          <button
            type="button"
            onClick={runCheck}
            className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-sm font-medium hover:bg-stone-200"
          >
            Retry
          </button>
        )}
      </div>
    </section>
  );
}
