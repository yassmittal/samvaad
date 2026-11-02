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

/** One quiet line at the bottom of the home page: is the server there (D-022). */
export function ApiStatusPanel() {
  const { healthResult, runCheck } = useApiStatus();

  return (
    <p
      aria-live="polite"
      title={
        healthResult.state === 'checking' ? webEnv.NEXT_PUBLIC_API_BASE_URL : healthResult.detail
      }
      className="flex items-center justify-center gap-2 text-xs text-call-muted"
    >
      <span aria-hidden className={`size-2 rounded-full ${RESULT_DOT_CLASS[healthResult.state]}`} />
      {RESULT_LABEL[healthResult.state]}
      {healthResult.state === 'failed' && (
        <button type="button" onClick={runCheck} className="underline underline-offset-2">
          Retry
        </button>
      )}
    </p>
  );
}
