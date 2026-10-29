/**
 * The audio the browser sends and the API forwards to Muse Voice Transcribe:
 * 16 kHz mono signed 16-bit little-endian PCM, in 80 ms frames (D-009).
 * Meta accepts `PCM_16KHZ` and resamples it to its native 24 kHz on its side.
 */

const MILLISECONDS_PER_SECOND = 1000;

export const SAMPLE_RATE_HERTZ = 16_000;
export const CHANNEL_COUNT = 1;
export const BYTES_PER_SAMPLE = 2;
export const FRAME_DURATION_MILLISECONDS = 80;

export const SAMPLES_PER_FRAME =
  (SAMPLE_RATE_HERTZ * FRAME_DURATION_MILLISECONDS) / MILLISECONDS_PER_SECOND;

export const BYTES_PER_FRAME = SAMPLES_PER_FRAME * CHANNEL_COUNT * BYTES_PER_SAMPLE;
