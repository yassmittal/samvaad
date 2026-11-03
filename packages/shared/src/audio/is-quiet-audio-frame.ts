// Root mean square below 1% of full scale: room tone after the phone's noise suppression, or
// the zeros a phone sends while it speaks a translation (D-019). Speech sits at 3 to 30%.
export const QUIET_AUDIO_ROOT_MEAN_SQUARE = 0.01;
const INT16_FULL_SCALE = 0x8000;
const BYTES_PER_INT16 = 2;

/**
 * Whether a PCM16 little-endian frame holds no speech, so it can be skipped when the audio is
 * running late (D-024). Reads through a DataView, so any byte offset works.
 */
export function isQuietAudioFrame(frame: Uint8Array): boolean {
  const sampleCount = Math.floor(frame.byteLength / BYTES_PER_INT16);
  if (sampleCount === 0) {
    return true;
  }
  const view = new DataView(frame.buffer, frame.byteOffset, sampleCount * BYTES_PER_INT16);
  let sumOfSquares = 0;
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const sample = view.getInt16(sampleIndex * BYTES_PER_INT16, true) / INT16_FULL_SCALE;
    sumOfSquares += sample * sample;
  }
  return Math.sqrt(sumOfSquares / sampleCount) < QUIET_AUDIO_ROOT_MEAN_SQUARE;
}
