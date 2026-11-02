/**
 * The spoken translation the API streams to a listener (D-021): 24 kHz mono signed 16-bit
 * little-endian PCM, in binary WebSocket frames. Each frame is
 *
 *   [1 byte: utterance id length in bytes][utterance id, UTF-8][PCM16 samples]
 *
 * so a phone can tell which translation a frame belongs to. The API only sends whole samples.
 */

export const TRANSLATION_AUDIO_SAMPLE_RATE_HERTZ = 24_000;
export const TRANSLATION_AUDIO_BYTES_PER_SAMPLE = 2;

const UTTERANCE_ID_LENGTH_HEADER_BYTE_COUNT = 1;
const MAXIMUM_UTTERANCE_ID_BYTE_COUNT = 255;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type TranslationAudioFrame = {
  utteranceId: string;
  /** PCM16 bytes, a whole number of samples. */
  audio: Uint8Array;
};

export function encodeTranslationAudioFrame({
  utteranceId,
  audio,
}: TranslationAudioFrame): Uint8Array {
  const utteranceIdBytes = textEncoder.encode(utteranceId);
  if (utteranceIdBytes.length > MAXIMUM_UTTERANCE_ID_BYTE_COUNT) {
    throw new RangeError(`An utterance id is at most ${MAXIMUM_UTTERANCE_ID_BYTE_COUNT} bytes.`);
  }
  const frame = new Uint8Array(
    UTTERANCE_ID_LENGTH_HEADER_BYTE_COUNT + utteranceIdBytes.length + audio.length,
  );
  frame[0] = utteranceIdBytes.length;
  frame.set(utteranceIdBytes, UTTERANCE_ID_LENGTH_HEADER_BYTE_COUNT);
  frame.set(audio, UTTERANCE_ID_LENGTH_HEADER_BYTE_COUNT + utteranceIdBytes.length);
  return frame;
}

/** `null` for a frame too short to hold its own header. */
export function decodeTranslationAudioFrame(frame: Uint8Array): TranslationAudioFrame | null {
  const utteranceIdByteCount = frame[0];
  const audioOffset = UTTERANCE_ID_LENGTH_HEADER_BYTE_COUNT + (utteranceIdByteCount ?? 0);
  if (utteranceIdByteCount === undefined || frame.length < audioOffset) {
    return null;
  }
  return {
    utteranceId: textDecoder.decode(
      frame.subarray(UTTERANCE_ID_LENGTH_HEADER_BYTE_COUNT, audioOffset),
    ),
    audio: frame.subarray(audioOffset),
  };
}
