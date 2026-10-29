import { z } from 'zod';

const webEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.url({
    error:
      'NEXT_PUBLIC_API_BASE_URL must be the URL of apps/api. Copy apps/web/.env.example to apps/web/.env.local.',
  }),
});

// Next.js inlines NEXT_PUBLIC_ variables only when they are read by their full name.
const parseResult = webEnvSchema.safeParse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
});

if (!parseResult.success) {
  throw new Error(parseResult.error.issues.map((issue) => issue.message).join('\n'));
}

export const webEnv = parseResult.data;
