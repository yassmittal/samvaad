'use client';

import { useCallback, useEffect, useState } from 'react';
import { webEnv } from '@/config/env';
import { checkApiHealth } from './check-api-health';

const CHECK_TIMEOUT_MILLISECONDS = 5000;

export type CheckResult =
  | { state: 'checking' }
  | { state: 'ok'; detail: string }
  | { state: 'failed'; detail: string };

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useApiStatus() {
  const [healthResult, setHealthResult] = useState<CheckResult>({ state: 'checking' });

  const runCheck = useCallback(() => {
    setHealthResult({ state: 'checking' });
    checkApiHealth({
      apiBaseUrl: webEnv.NEXT_PUBLIC_API_BASE_URL,
      timeoutMilliseconds: CHECK_TIMEOUT_MILLISECONDS,
    })
      .then(() => setHealthResult({ state: 'ok', detail: 'Ready to translate' }))
      .catch((error: unknown) =>
        setHealthResult({ state: 'failed', detail: describeError(error) }),
      );
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  return { healthResult, runCheck };
}
