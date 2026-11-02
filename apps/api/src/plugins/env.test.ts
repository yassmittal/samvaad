import { describe, expect, test } from 'bun:test';
import { InvalidEnvError, parseApiEnv } from './env';

describe('parseApiEnv', () => {
  test('stops with a clear message when META_API_KEY is missing', () => {
    expect(() => parseApiEnv({})).toThrow(InvalidEnvError);
    expect(() => parseApiEnv({})).toThrow(/META_API_KEY is required/);
  });

  test('treats a blank META_API_KEY as missing', () => {
    expect(() => parseApiEnv({ META_API_KEY: '   ' })).toThrow(/META_API_KEY is required/);
  });

  test('fills in the defaults', () => {
    const env = parseApiEnv({ META_API_KEY: 'test-key' });

    expect(env.PORT).toBe(4400);
    expect(env.ALLOWED_WEB_ORIGINS).toEqual(['http://localhost:3400']);
    expect(env.MAX_ROOM_DURATION_MINUTES).toBe(60);
    expect(env.PARTICIPANT_RECONNECT_GRACE_SECONDS).toBe(60);
    expect(env.TRANSLATION_PARALLEL_REQUEST_COUNT).toBe(2);
    // Phones speak with their own voice unless a voice API is set up (D-021).
    expect(env.SPEECH_PROVIDER).toBe('browser');
    expect(env.SPEECH_VOICE_IDS).toEqual([]);
  });

  test('a voice API needs its key and at least one voice (D-021)', () => {
    expect(() => parseApiEnv({ META_API_KEY: 'test-key', SPEECH_PROVIDER: 'elevenlabs' })).toThrow(
      /ELEVENLABS_API_KEY is required when SPEECH_PROVIDER=elevenlabs[\s\S]*SPEECH_VOICE_IDS/,
    );
    expect(() =>
      parseApiEnv({
        META_API_KEY: 'test-key',
        SPEECH_PROVIDER: 'cartesia',
        SPEECH_VOICE_IDS: 'voice-one',
      }),
    ).toThrow(/CARTESIA_API_KEY is required/);
  });

  test('splits the comma-separated voice ids', () => {
    const env = parseApiEnv({
      META_API_KEY: 'test-key',
      SPEECH_PROVIDER: 'elevenlabs',
      ELEVENLABS_API_KEY: 'key',
      SPEECH_VOICE_IDS: 'first-voice, second-voice',
    });

    expect(env.SPEECH_VOICE_IDS).toEqual(['first-voice', 'second-voice']);
  });

  test('splits a comma-separated list of allowed origins', () => {
    const env = parseApiEnv({
      META_API_KEY: 'test-key',
      ALLOWED_WEB_ORIGINS: 'http://localhost:3400, https://example.trycloudflare.com',
    });

    expect(env.ALLOWED_WEB_ORIGINS).toEqual([
      'http://localhost:3400',
      'https://example.trycloudflare.com',
    ]);
  });

  test('rejects an allowed origin that is not a URL', () => {
    expect(() =>
      parseApiEnv({ META_API_KEY: 'test-key', ALLOWED_WEB_ORIGINS: 'not a url' }),
    ).toThrow(/ALLOWED_WEB_ORIGINS/);
  });
});
