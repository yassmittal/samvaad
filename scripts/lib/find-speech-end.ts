const MILLISECONDS_PER_SECOND = 1000;
const BYTES_PER_SAMPLE = 2;
const MAXIMUM_SAMPLE_VALUE = 32_768;
const ANALYSIS_WINDOW_MILLISECONDS = 20;
/** Root-mean-square level, as a fraction of full scale, above which a window counts as speech. */
const SPEECH_LEVEL_THRESHOLD = 0.02;

/**
 * Finds where the last speech in a mono PCM16 recording ends, so the transcription smoke test
 * can measure "end of speech → final transcript" (D-011). Returns `null` for silence.
 */
export function findSpeechEndMilliseconds(
  pcmBytes: Uint8Array,
  sampleRateHertz: number,
): number | null {
  const samples = new Int16Array(
    pcmBytes.buffer,
    pcmBytes.byteOffset,
    Math.floor(pcmBytes.byteLength / BYTES_PER_SAMPLE),
  );
  const samplesPerWindow = Math.round(
    (sampleRateHertz * ANALYSIS_WINDOW_MILLISECONDS) / MILLISECONDS_PER_SECOND,
  );
  let speechEndSampleIndex: number | null = null;

  for (let windowStart = 0; windowStart < samples.length; windowStart += samplesPerWindow) {
    const windowEnd = Math.min(windowStart + samplesPerWindow, samples.length);
    let sumOfSquares = 0;
    for (let sampleIndex = windowStart; sampleIndex < windowEnd; sampleIndex++) {
      const normalizedSample = (samples[sampleIndex] ?? 0) / MAXIMUM_SAMPLE_VALUE;
      sumOfSquares += normalizedSample * normalizedSample;
    }
    const rootMeanSquareLevel = Math.sqrt(sumOfSquares / (windowEnd - windowStart));
    if (rootMeanSquareLevel > SPEECH_LEVEL_THRESHOLD) {
      speechEndSampleIndex = windowEnd;
    }
  }

  if (speechEndSampleIndex === null) {
    return null;
  }
  return Math.round((speechEndSampleIndex / sampleRateHertz) * MILLISECONDS_PER_SECOND);
}
