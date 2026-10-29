import { z } from 'zod';

const healthResponseSchema = z.object({ status: z.literal('ok') });

type HealthCheckOptions = {
  apiBaseUrl: string;
  timeoutMilliseconds: number;
};

export async function checkApiHealth({
  apiBaseUrl,
  timeoutMilliseconds,
}: HealthCheckOptions): Promise<void> {
  const response = await fetch(new URL('/health', apiBaseUrl), {
    signal: AbortSignal.timeout(timeoutMilliseconds),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  healthResponseSchema.parse(await response.json());
}
