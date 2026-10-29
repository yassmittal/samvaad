import { describe, expect, test } from 'bun:test';
import { pickVoice } from './pick-voice';

function createVoice(lang: string, localService = true) {
  return { name: `${lang} ${localService ? 'local' : 'network'}`, lang, localService };
}

describe('pickVoice', () => {
  test('prefers the exact tag over another voice of the same language', () => {
    const voices = [createVoice('en-US'), createVoice('en-IN'), createVoice('hi-IN')];

    expect(pickVoice(voices, 'en-IN')?.lang).toBe('en-IN');
  });

  test('falls back to the same language in another region', () => {
    const voices = [createVoice('en-GB'), createVoice('hi-IN')];

    expect(pickVoice(voices, 'en-IN')?.lang).toBe('en-GB');
  });

  test('reads underscore and lower-case tags, as some Android builds report them', () => {
    const voices = [createVoice('hi_in')];

    expect(pickVoice(voices, 'hi-IN')?.lang).toBe('hi_in');
  });

  test('prefers an on-device voice among equal matches', () => {
    const voices = [createVoice('hi-IN', false), createVoice('hi-IN', true)];

    expect(pickVoice(voices, 'hi-IN')?.localService).toBe(true);
  });

  test('returns null when no voice speaks the language', () => {
    const voices = [createVoice('en-IN'), createVoice('hi-IN')];

    expect(pickVoice(voices, 'ta-IN')).toBeNull();
    expect(pickVoice([], 'hi-IN')).toBeNull();
  });
});
