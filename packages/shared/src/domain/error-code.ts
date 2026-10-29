import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'INVALID_MESSAGE',
  'UPSTREAM_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;
