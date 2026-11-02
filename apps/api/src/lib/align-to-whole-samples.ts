import { TRANSLATION_AUDIO_BYTES_PER_SAMPLE } from '@samvaad/shared';

/**
 * Re-cuts a stream of PCM16 bytes so every chunk holds whole samples. A voice API streams
 * bytes as the network delivers them, so a sample can be split across two chunks; the phone
 * reads each frame on its own and needs whole samples (D-021).
 */
export async function* alignToWholeSamples(
  byteChunks: AsyncIterable<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  let carriedBytes = new Uint8Array();
  for await (const byteChunk of byteChunks) {
    const bytes = carriedBytes.length === 0 ? byteChunk : concatenateBytes(carriedBytes, byteChunk);
    const wholeSampleByteCount = bytes.length - (bytes.length % TRANSLATION_AUDIO_BYTES_PER_SAMPLE);
    carriedBytes = bytes.slice(wholeSampleByteCount);
    if (wholeSampleByteCount > 0) {
      yield bytes.subarray(0, wholeSampleByteCount);
    }
  }
}

function concatenateBytes(firstBytes: Uint8Array, secondBytes: Uint8Array): Uint8Array {
  const joinedBytes = new Uint8Array(firstBytes.length + secondBytes.length);
  joinedBytes.set(firstBytes);
  joinedBytes.set(secondBytes, firstBytes.length);
  return joinedBytes;
}
