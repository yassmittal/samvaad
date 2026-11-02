'use client';

import { useEffect, useRef } from 'react';
import { calculateLoudnessLevel, smoothLoudnessLevel } from './calculate-loudness-level';
import type { CallOrbState } from './find-call-orb-state';

const ORB_STATE_LABELS = {
  idle: 'Ready',
  you_speaking: 'You are speaking',
  translating_to_them: 'Translating for them',
  translating_to_you: 'Translating for you',
  they_speaking: 'They are speaking',
  their_translation_playing: 'Speaking their words',
  reconnecting: 'Reconnecting',
} as const satisfies Record<CallOrbState, string>;

type CallOrbProps = {
  state: CallOrbState;
  /** The analyser of whichever voice the orb should follow now, or `null` to settle. */
  findAnalyserNode: () => AnalyserNode | null;
  className?: string;
};

/**
 * The call screen's one moving thing (D-022): a sphere whose colours say who is talking and
 * whose size follows the voice being heard. The loudness is written straight to a CSS
 * variable every frame, so React doesn't re-render 60 times a second.
 */
export function CallOrb({ state, findAnalyserNode, className = '' }: CallOrbProps) {
  const orbRef = useRef<HTMLDivElement>(null);
  const findAnalyserNodeRef = useRef(findAnalyserNode);
  findAnalyserNodeRef.current = findAnalyserNode;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    let animationFrameId = 0;
    let shownLevel = 0;
    let samples = new Float32Array(0);
    const updateLevel = () => {
      const analyserNode = findAnalyserNodeRef.current();
      let measuredLevel = 0;
      if (analyserNode !== null) {
        if (samples.length !== analyserNode.fftSize) {
          samples = new Float32Array(analyserNode.fftSize);
        }
        analyserNode.getFloatTimeDomainData(samples);
        measuredLevel = calculateLoudnessLevel(samples);
      }
      shownLevel = smoothLoudnessLevel(shownLevel, measuredLevel);
      orbRef.current?.style.setProperty('--orb-level', shownLevel.toFixed(3));
      animationFrameId = requestAnimationFrame(updateLevel);
    };
    animationFrameId = requestAnimationFrame(updateLevel);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div
      ref={orbRef}
      data-state={state}
      role="img"
      aria-label={ORB_STATE_LABELS[state]}
      className={`call-orb ${className}`}
    >
      <div className="call-orb-halo" />
      <div className="call-orb-body" />
      <div className="call-orb-sheen" />
    </div>
  );
}
