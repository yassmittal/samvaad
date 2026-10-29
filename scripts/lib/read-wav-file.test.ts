import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { parseWavFile } from './read-wav-file';

const SAMPLE_RATE_HERTZ = 16_000;

function createWavFile(chunks: { chunkId: string; body: Uint8Array }[]): Uint8Array {
  const totalChunkBytes = chunks.reduce(
    (total, chunk) => total + 8 + chunk.body.byteLength + (chunk.body.byteLength % 2),
    0,
  );
  const fileBytes = new Uint8Array(12 + totalChunkBytes);
  const view = new DataView(fileBytes.buffer);
  const writeFourCharacterCode = (byteOffset: number, code: string) => {
    for (let index = 0; index < 4; index++) {
      view.setUint8(byteOffset + index, code.charCodeAt(index));
    }
  };

  writeFourCharacterCode(0, 'RIFF');
  view.setUint32(4, fileBytes.byteLength - 8, true);
  writeFourCharacterCode(8, 'WAVE');

  let chunkOffset = 12;
  for (const chunk of chunks) {
    writeFourCharacterCode(chunkOffset, chunk.chunkId);
    view.setUint32(chunkOffset + 4, chunk.body.byteLength, true);
    fileBytes.set(chunk.body, chunkOffset + 8);
    chunkOffset += 8 + chunk.body.byteLength + (chunk.body.byteLength % 2);
  }
  return fileBytes;
}

function createFormatChunkBody(formatTag = 1): Uint8Array {
  const body = new Uint8Array(16);
  const view = new DataView(body.buffer);
  view.setUint16(0, formatTag, true);
  view.setUint16(2, 1, true);
  view.setUint32(4, SAMPLE_RATE_HERTZ, true);
  view.setUint32(8, SAMPLE_RATE_HERTZ * 2, true);
  view.setUint16(12, 2, true);
  view.setUint16(14, 16, true);
  return body;
}

describe('parseWavFile', () => {
  test('reads the format and the sample bytes', () => {
    const sampleBytes = new Uint8Array([1, 2, 3, 4]);
    const wavAudio = parseWavFile(
      createWavFile([
        { chunkId: 'fmt ', body: createFormatChunkBody() },
        { chunkId: 'data', body: sampleBytes },
      ]),
    );

    expect(wavAudio.sampleRateHertz).toBe(SAMPLE_RATE_HERTZ);
    expect(wavAudio.channelCount).toBe(1);
    expect(wavAudio.bitsPerSample).toBe(16);
    expect([...wavAudio.pcmBytes]).toEqual([...sampleBytes]);
  });

  test('skips extra chunks, including odd-sized padded ones, before the data', () => {
    const wavAudio = parseWavFile(
      createWavFile([
        { chunkId: 'fmt ', body: createFormatChunkBody() },
        { chunkId: 'FLLR', body: new Uint8Array(3) },
        { chunkId: 'data', body: new Uint8Array([9, 9]) },
      ]),
    );

    expect([...wavAudio.pcmBytes]).toEqual([9, 9]);
  });

  test('rejects compressed audio', () => {
    const compressedFormatTag = 3;
    expect(() =>
      parseWavFile(
        createWavFile([
          { chunkId: 'fmt ', body: createFormatChunkBody(compressedFormatTag) },
          { chunkId: 'data', body: new Uint8Array(2) },
        ]),
      ),
    ).toThrow(/uncompressed PCM/);
  });

  test('rejects a file that is not a WAV file', () => {
    expect(() => parseWavFile(new TextEncoder().encode('definitely not a wav file'))).toThrow(
      /RIFF\/WAVE/,
    );
  });

  test('reads the fixtures the smoke script streams', async () => {
    for (const fileName of ['hindi.wav', 'english.wav', 'hinglish.wav']) {
      const fileBytes = await Bun.file(join(import.meta.dir, '..', 'fixtures', fileName)).bytes();
      const wavAudio = parseWavFile(fileBytes);

      expect(wavAudio.sampleRateHertz).toBe(SAMPLE_RATE_HERTZ);
      expect(wavAudio.channelCount).toBe(1);
      expect(wavAudio.pcmBytes.byteLength).toBeGreaterThan(SAMPLE_RATE_HERTZ * 2);
    }
  });
});
