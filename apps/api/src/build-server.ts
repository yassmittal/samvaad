import Fastify, { type FastifyInstance } from 'fastify';
import { corsPlugin } from './plugins/cors';
import { type ApiEnv, envPlugin } from './plugins/env';
import { errorHandlerPlugin } from './plugins/error-handler';
import { websocketPlugin } from './plugins/websocket';
import { conversationSocketRoutes } from './routes/conversation-socket';
import { healthRoutes } from './routes/health';

type BuildServerOptions = {
  env: ApiEnv;
  isLoggingEnabled: boolean;
};

/** Assembles the server without starting it, so tests can use `inject` and `injectWS`. */
export async function buildServer({
  env,
  isLoggingEnabled,
}: BuildServerOptions): Promise<FastifyInstance> {
  const server = Fastify({ logger: isLoggingEnabled });

  await server.register(envPlugin, { env });
  await server.register(errorHandlerPlugin);
  await server.register(corsPlugin);
  await server.register(websocketPlugin);

  await server.register(healthRoutes);
  await server.register(conversationSocketRoutes);

  return server;
}
