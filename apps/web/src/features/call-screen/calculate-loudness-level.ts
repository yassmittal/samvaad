// A speaking voice reaches an RMS of about 0.1 to 0.3; this maps that onto most of 0 to 1.
const LOUDNESS_GAIN = 4;

/** How loud a stretch of samples is, from 0 (silence) to 1 (loud speech), for the orb (D-022). */
export function calculateLoudnessLevel(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sumOfSquares = 0;
  for (const sample of samples) {
    sumOfSquares += sample * sample;
  }
  const rootMeanSquare = Math.sqrt(sumOfSquares / samples.length);
  // The square root lifts quiet speech, so the orb answers a soft voice too.
  return Math.min(1, Math.sqrt(rootMeanSquare * LOUDNESS_GAIN));
}

// Rise fast, fall slowly: the orb jumps with a syllable and settles between words.
const ATTACK_SMOOTHING = 0.6;
const RELEASE_SMOOTHING = 0.12;

/** One step of smoothing from the last shown level towards the newly measured one. */
export function smoothLoudnessLevel(previousLevel: number, measuredLevel: number): number {
  const smoothing = measuredLevel > previousLevel ? ATTACK_SMOOTHING : RELEASE_SMOOTHING;
  return previousLevel + (measuredLevel - previousLevel) * smoothing;
}
