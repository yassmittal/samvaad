'use client';

import { useCallback, useEffect, useState } from 'react';
import { webEnv } from '@/config/env';
import { checkConversationSocketEcho } from '@/lib/conversation-socket/check-conversation-socket-echo';
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
  const [socketResult, setSocketResult] = useState<CheckResult>({ state: 'checking' });

  const runChecks = useCallback(() => {
    const apiBaseUrl = webEnv.NEXT_PUBLIC_API_BASE_URL;
    setHealthResult({ state: 'checking' });
    setSocketResult({ state: 'checking' });

    checkApiHealth({ apiBaseUrl, timeoutMilliseconds: CHECK_TIMEOUT_MILLISECONDS })
      .then(() => setHealthResult({ state: 'ok', detail: 'GET /health answered ok' }))
      .catch((error: unknown) =>
        setHealthResult({ state: 'failed', detail: describeError(error) }),
      );

    checkConversationSocketEcho({ apiBaseUrl, timeoutMilliseconds: CHECK_TIMEOUT_MILLISECONDS })
      .then(({ roundTripMilliseconds }) =>
        setSocketResult({ state: 'ok', detail: `Echo round trip ${roundTripMilliseconds} ms` }),
      )
      .catch((error: unknown) =>
        setSocketResult({ state: 'failed', detail: describeError(error) }),
      );
  }, []);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  return { healthResult, socketResult, runChecks };
}
