'use client';

import { useEffect } from 'react';

/**
 * Keeps the screen on while a conversation is on screen (D-001, D-017): a phone that locks
 * stops its microphone and its speech. Does nothing where the browser has no wake lock.
 */
export function useScreenWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) {
      return;
    }
    let wakeLock: WakeLockSentinel | null = null;
    let isUnmounted = false;

    async function requestWakeLock(): Promise<void> {
      if (document.visibilityState !== 'visible' || (wakeLock !== null && !wakeLock.released)) {
        return;
      }
      try {
        const requestedWakeLock = await navigator.wakeLock.request('screen');
        if (isUnmounted) {
          void requestedWakeLock.release();
          return;
        }
        wakeLock = requestedWakeLock;
      } catch (error) {
        // Refused in low-power mode, for one; the screen just locks as usual.
        console.warn('could not keep the screen on', error);
      }
    }

    // The browser drops the lock whenever the page is hidden; ask again when it's back.
    function handleVisibilityChange(): void {
      void requestWakeLock();
    }

    void requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      isUnmounted = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void wakeLock?.release();
    };
  }, []);
}
