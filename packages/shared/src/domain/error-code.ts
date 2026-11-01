import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'INVALID_MESSAGE',
  'UNSUPPORTED_LANGUAGE',
  'MICROPHONE_NOT_OPEN',
  'UPSTREAM_UNAVAILABLE',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'RECAP_UNAVAILABLE',
  'ROOM_TIME_LIMIT_REACHED',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;
