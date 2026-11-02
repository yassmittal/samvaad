import { type IceServer, iceServerSchema } from '@samvaad/shared';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import type { ApiEnv } from '../plugins/env';

// Free and unlimited (Cloudflare's STUN FAQ); Google's as a second opinion.
export const FREE_STUN_SERVERS: IceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
];
// A day: longer than a room lives (MAX_ROOM_DURATION_MINUTES).
const TURN_CREDENTIAL_TIME_TO_LIVE_SECONDS = 86_400;
const TURN_REQUEST_TIMEOUT_MILLISECONDS = 5_000;

// Cloudflare has answered both a list and a single server here over its API's versions.
const generatedIceServersSchema = z.object({
  iceServers: z.union([z.array(iceServerSchema), iceServerSchema]),
});

/**
 * Where two phones look for each other for the real voice (D-023): free STUN, plus short-lived
 * Cloudflare TURN credentials when a TURN key is set. Only this file talks to Cloudflare.
 */
export function createIceServersClient({
  env,
  logger,
}: {
  env: ApiEnv;
  logger: Pick<FastifyBaseLogger, 'warn'>;
}) {
  const hasTurnKey =
    env.CLOUDFLARE_TURN_KEY_ID.length > 0 && env.CLOUDFLARE_TURN_API_TOKEN.length > 0;

  async function generateTurnServers(): Promise<IceServer[]> {
    const url = new URL(
      `/v1/turn/keys/${encodeURIComponent(env.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`,
      env.CLOUDFLARE_TURN_API_BASE_URL,
    );
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: TURN_CREDENTIAL_TIME_TO_LIVE_SECONDS }),
      signal: AbortSignal.timeout(TURN_REQUEST_TIMEOUT_MILLISECONDS),
    });
    if (!response.ok) {
      throw new Error(`Cloudflare TURN HTTP ${response.status}`);
    }
    const { iceServers } = generatedIceServersSchema.parse(await response.json());
    return Array.isArray(iceServers) ? iceServers : [iceServers];
  }

  return {
    /** Never throws: without TURN, the free STUN servers alone. */
    async findIceServers(): Promise<IceServer[]> {
      if (!hasTurnKey) {
        return FREE_STUN_SERVERS;
      }
      try {
        return [...FREE_STUN_SERVERS, ...(await generateTurnServers())];
      } catch (error) {
        logger.warn({ err: error }, 'TURN credentials failed: STUN only');
        return FREE_STUN_SERVERS;
      }
    },
  };
}

export type IceServersClient = ReturnType<typeof createIceServersClient>;
