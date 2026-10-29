import type { ErrorCode } from '@samvaad/shared';
import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

const INTERNAL_SERVER_ERROR_STATUS = 500;
const FIRST_SERVER_ERROR_STATUS = 500;

type HttpErrorBody = { error: { code: ErrorCode; message: string } };

function findStatusCode(error: unknown): number {
  if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  return INTERNAL_SERVER_ERROR_STATUS;
}

/** Every HTTP error leaves as `{ error: { code, message } }`. Server errors hide their details. */
export const errorHandlerPlugin = fastifyPlugin(
  async (server: FastifyInstance) => {
    server.setErrorHandler((error, request, reply) => {
      const statusCode = findStatusCode(error);
      const isServerError = statusCode >= FIRST_SERVER_ERROR_STATUS;

      if (isServerError) {
        request.log.error({ err: error }, 'request failed');
      }

      const body: HttpErrorBody = isServerError
        ? { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' } }
        : {
            error: {
              code: 'INVALID_MESSAGE',
              message: error instanceof Error ? error.message : 'Invalid request.',
            },
          };

      return reply.status(statusCode).send(body);
    });
  },
  { name: 'error-handler' },
);
