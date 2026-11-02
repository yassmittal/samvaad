import { describe, expect, test } from 'bun:test';
import { parseWavFile } from './read-wav-file';
import { createWavFile } from './write-wav-file';

describe('createWavFile', () => {
  test('writes a WAV file that the reader reads back', () => {
    const pcmBytes = new Uint8Array([1, 0, 255, 127, 0, 128]);

    const wavAudio = parseWavFile(
      createWavFile({ pcmBytes, sampleRateHertz: 24_000, channelCount: 1, bitsPerSample: 16 }),
    );

    expect(wavAudio.sampleRateHertz).toBe(24_000);
    expect(wavAudio.channelCount).toBe(1);
    expect(wavAudio.bitsPerSample).toBe(16);
    expect([...wavAudio.pcmBytes]).toEqual([...pcmBytes]);
  });
});
