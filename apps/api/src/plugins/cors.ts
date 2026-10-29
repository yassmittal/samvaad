import fastifyCors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

/** The web app is served from another origin (Vercel, or a tunnel in development). */
export const corsPlugin = fastifyPlugin(
  async (server: FastifyInstance) => {
    await server.register(fastifyCors, { origin: server.env.ALLOWED_WEB_ORIGINS });
  },
  { name: 'cors', dependencies: ['env'] },
);
