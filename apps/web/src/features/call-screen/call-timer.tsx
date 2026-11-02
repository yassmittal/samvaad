'use client';

import { useEffect, useState } from 'react';
import { formatCallDuration } from './format-call-duration';

const TICK_MILLISECONDS = 1000;

/** How long the call has been connected, like a phone's call screen (D-022). */
export function CallTimer({ startedAtEpochMilliseconds }: { startedAtEpochMilliseconds: number }) {
  const [nowEpochMilliseconds, setNowEpochMilliseconds] = useState(startedAtEpochMilliseconds);

  useEffect(() => {
    setNowEpochMilliseconds(Date.now());
    const interval = setInterval(() => setNowEpochMilliseconds(Date.now()), TICK_MILLISECONDS);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="tabular-nums">
      {formatCallDuration(nowEpochMilliseconds - startedAtEpochMilliseconds)}
    </span>
  );
}
