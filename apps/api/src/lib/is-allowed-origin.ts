/**
 * Browsers don't apply CORS to WebSockets, so the socket route checks the Origin itself.
 * Requests without an Origin come from non-browser clients (tests, scripts) and are allowed:
 * the check stops other websites from using a visitor's browser, not determined callers.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  allowedWebOrigins: readonly string[],
): boolean {
  if (origin === undefined) {
    return true;
  }
  return allowedWebOrigins.includes(origin);
}
