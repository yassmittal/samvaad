const WAV_HEADER_BYTES = 44;
const PCM_FORMAT_TAG = 1;
const BITS_PER_BYTE = 8;
const FMT_CHUNK_BYTES = 16;

/** Wraps raw little-endian PCM in a 44-byte WAV header, so any player can open it. */
export function createWavFile({
  pcmBytes,
  sampleRateHertz,
  channelCount,
  bitsPerSample,
}: {
  pcmBytes: Uint8Array;
  sampleRateHertz: number;
  channelCount: number;
  bitsPerSample: number;
}): Uint8Array {
  const fileBytes = new Uint8Array(WAV_HEADER_BYTES + pcmBytes.length);
  const view = new DataView(fileBytes.buffer);
  const blockAlignBytes = (channelCount * bitsPerSample) / BITS_PER_BYTE;
  const writeFourCharacterCode = (byteOffset: number, code: string) => {
    for (const [characterIndex, character] of [...code].entries()) {
      view.setUint8(byteOffset + characterIndex, character.charCodeAt(0));
    }
  };

  writeFourCharacterCode(0, 'RIFF');
  view.setUint32(4, WAV_HEADER_BYTES - 8 + pcmBytes.length, true);
  writeFourCharacterCode(8, 'WAVE');
  writeFourCharacterCode(12, 'fmt ');
  view.setUint32(16, FMT_CHUNK_BYTES, true);
  view.setUint16(20, PCM_FORMAT_TAG, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRateHertz, true);
  view.setUint32(28, sampleRateHertz * blockAlignBytes, true);
  view.setUint16(32, blockAlignBytes, true);
  view.setUint16(34, bitsPerSample, true);
  writeFourCharacterCode(36, 'data');
  view.setUint32(40, pcmBytes.length, true);
  fileBytes.set(pcmBytes, WAV_HEADER_BYTES);
  return fileBytes;
}
