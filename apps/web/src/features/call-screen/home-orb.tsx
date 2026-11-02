'use client';

import { useEffect, useState } from 'react';
import type { CallOrbState } from './find-call-orb-state';

// The home page shows the call's states in turn, so the orb explains itself (D-022).
const HOME_ORB_STATES: readonly CallOrbState[] = [
  'idle',
  'you_speaking',
  'translating_to_them',
  'their_translation_playing',
  'translating_to_you',
];
const HOME_ORB_STATE_MILLISECONDS = 2600;

/** The orb on the home page, cycling slowly through a call: you speak, it travels, they hear. */
export function HomeOrb() {
  const [stateIndex, setStateIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const interval = setInterval(
      () => setStateIndex((index) => (index + 1) % HOME_ORB_STATES.length),
      HOME_ORB_STATE_MILLISECONDS,
    );
    return () => clearInterval(interval);
  }, []);

  return (
    <div aria-hidden data-state={HOME_ORB_STATES[stateIndex]} className="call-orb w-44">
      <div className="call-orb-halo" />
      <div className="call-orb-body" />
      <div className="call-orb-sheen" />
    </div>
  );
}
