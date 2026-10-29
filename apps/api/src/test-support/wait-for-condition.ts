const POLL_INTERVAL_MILLISECONDS = 5;
const DEFAULT_TIMEOUT_MILLISECONDS = 2000;

/** Resolves once `condition` holds; rejects with `description` if it never does. */
export async function waitForCondition(
  condition: () => boolean,
  description: string,
  timeoutMilliseconds = DEFAULT_TIMEOUT_MILLISECONDS,
): Promise<void> {
  const deadlineMilliseconds = Date.now() + timeoutMilliseconds;
  while (!condition()) {
    if (Date.now() > deadlineMilliseconds) {
      throw new Error(`Timed out waiting for: ${description}`);
    }
    await Bun.sleep(POLL_INTERVAL_MILLISECONDS);
  }
}
