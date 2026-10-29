const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const PCM_FORMAT_TAG = 1;

export type WavAudio = {
  sampleRateHertz: number;
  channelCount: number;
  bitsPerSample: number;
  /** The raw sample bytes from the `data` chunk, little-endian. */
  pcmBytes: Uint8Array;
};

function readFourCharacterCode(view: DataView, byteOffset: number): string {
  return String.fromCharCode(
    view.getUint8(byteOffset),
    view.getUint8(byteOffset + 1),
    view.getUint8(byteOffset + 2),
    view.getUint8(byteOffset + 3),
  );
}

/**
 * Reads an uncompressed PCM WAV file. Walks every chunk instead of assuming a 44-byte header,
 * because macOS `say` and `afconvert` add chunks (such as `FLLR`) before `data`.
 */
export function parseWavFile(fileBytes: Uint8Array): WavAudio {
  const view = new DataView(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength);
  if (
    fileBytes.byteLength < RIFF_HEADER_BYTES ||
    readFourCharacterCode(view, 0) !== 'RIFF' ||
    readFourCharacterCode(view, 8) !== 'WAVE'
  ) {
    throw new Error('Not a RIFF/WAVE file.');
  }

  let format: Omit<WavAudio, 'pcmBytes'> | null = null;
  let chunkOffset = RIFF_HEADER_BYTES;

  while (chunkOffset + CHUNK_HEADER_BYTES <= fileBytes.byteLength) {
    const chunkId = readFourCharacterCode(view, chunkOffset);
    const chunkSizeBytes = view.getUint32(chunkOffset + 4, true);
    const chunkBodyOffset = chunkOffset + CHUNK_HEADER_BYTES;

    if (chunkId === 'fmt ') {
      const formatTag = view.getUint16(chunkBodyOffset, true);
      if (formatTag !== PCM_FORMAT_TAG) {
        throw new Error(`Only uncompressed PCM WAV is supported (format tag ${formatTag}).`);
      }
      format = {
        channelCount: view.getUint16(chunkBodyOffset + 2, true),
        sampleRateHertz: view.getUint32(chunkBodyOffset + 4, true),
        bitsPerSample: view.getUint16(chunkBodyOffset + 14, true),
      };
    }

    if (chunkId === 'data') {
      if (format === null) {
        throw new Error('The WAV file has a data chunk before its fmt chunk.');
      }
      const dataEndOffset = Math.min(chunkBodyOffset + chunkSizeBytes, fileBytes.byteLength);
      return { ...format, pcmBytes: fileBytes.subarray(chunkBodyOffset, dataEndOffset) };
    }

    // RIFF chunks are padded to an even number of bytes.
    chunkOffset = chunkBodyOffset + chunkSizeBytes + (chunkSizeBytes % 2);
  }

  throw new Error('The WAV file has no data chunk.');
}
