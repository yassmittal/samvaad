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
