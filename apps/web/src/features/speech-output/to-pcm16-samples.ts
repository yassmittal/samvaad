/**
 * PCM16 little-endian bytes as samples. Copies first: the bytes of a decoded frame start at an
 * odd offset, and an Int16Array needs an even one. Browsers only run on little-endian machines.
 */
export function toPcm16Samples(audio: Uint8Array): Int16Array {
  return new Int16Array(audio.slice().buffer);
}
