import { describe, expect, test } from 'bun:test';
import {
  decodeTranslationAudioFrame,
  encodeTranslationAudioFrame,
} from './translation-audio-frame';

describe('translation audio frames', () => {
  test('round-trip an utterance id and its audio', () => {
    const audio = new Uint8Array([1, 2, 3, 4, 250, 251]);
    const utteranceId = '1b4e28ba-2fa1-11d2-883f-0016d3cca427';

    const decoded = decodeTranslationAudioFrame(
      encodeTranslationAudioFrame({ utteranceId, audio }),
    );

    expect(decoded?.utteranceId).toBe(utteranceId);
    expect([...(decoded?.audio ?? [])]).toEqual([...audio]);
  });

  test('a frame with no audio decodes to empty audio', () => {
    const decoded = decodeTranslationAudioFrame(
      encodeTranslationAudioFrame({ utteranceId: 'u1', audio: new Uint8Array() }),
    );

    expect(decoded).toEqual({ utteranceId: 'u1', audio: new Uint8Array() });
  });

  test('a frame shorter than its own header is not a frame', () => {
    expect(decodeTranslationAudioFrame(new Uint8Array())).toBeNull();
    expect(decodeTranslationAudioFrame(new Uint8Array([10, 65]))).toBeNull();
  });

  test('refuses an utterance id longer than the one-byte header allows', () => {
    expect(() =>
      encodeTranslationAudioFrame({ utteranceId: 'x'.repeat(256), audio: new Uint8Array() }),
    ).toThrow(RangeError);
  });
});
