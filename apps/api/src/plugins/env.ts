import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { z } from 'zod';

const DEFAULT_PORT = 4400;
const DEFAULT_ALLOWED_WEB_ORIGINS = 'http://localhost:3400';
const MISSING_META_API_KEY_MESSAGE =
  'is required. Copy apps/api/.env.example to apps/api/.env and set your Meta Model API key.';

export const apiEnvSchema = z.object({
  META_API_KEY: z
    .string({ error: MISSING_META_API_KEY_MESSAGE })
    .trim()
    .min(1, { error: MISSING_META_API_KEY_MESSAGE }),
  PORT: z.coerce.number().int().min(1).max(65_535).default(DEFAULT_PORT),
  ALLOWED_WEB_ORIGINS: z
    .string()
    .default(DEFAULT_ALLOWED_WEB_ORIGINS)
    .transform((commaSeparatedOrigins) =>
      commaSeparatedOrigins
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .pipe(z.array(z.url({ error: 'must be a comma-separated list of origins' }))),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export class InvalidEnvError extends Error {
  override name = 'InvalidEnvError';
}

export function parseApiEnv(variables: Record<string, string | undefined>): ApiEnv {
  const result = apiEnvSchema.safeParse(variables);
  if (result.success) {
    return result.data;
  }

  const problems = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(root)'} ${issue.message}`,
  );
  throw new InvalidEnvError(['The API cannot start. Invalid environment:', ...problems].join('\n'));
}

declare module 'fastify' {
  interface FastifyInstance {
    env: ApiEnv;
  }
}

/** Makes the parsed env available as `server.env` to every route and handler. */
export const envPlugin = fastifyPlugin(
  async (server: FastifyInstance, options: { env: ApiEnv }) => {
    server.decorate('env', options.env);
  },
  { name: 'env' },
);
