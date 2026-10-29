import { describe, expect, test } from 'bun:test';
import { isAllowedOrigin } from './is-allowed-origin';

const ALLOWED_WEB_ORIGINS = ['http://localhost:3400'];

describe('isAllowedOrigin', () => {
  test('allows a listed origin', () => {
    expect(isAllowedOrigin('http://localhost:3400', ALLOWED_WEB_ORIGINS)).toBe(true);
  });

  test('rejects an unlisted origin', () => {
    expect(isAllowedOrigin('https://somewhere-else.example', ALLOWED_WEB_ORIGINS)).toBe(false);
  });

  test('allows a request with no origin, which only non-browser clients send', () => {
    expect(isAllowedOrigin(undefined, ALLOWED_WEB_ORIGINS)).toBe(true);
  });
});
