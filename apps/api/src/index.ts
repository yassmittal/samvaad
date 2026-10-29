import { buildServer } from './build-server';
import { InvalidEnvError, parseApiEnv } from './plugins/env';

// Only reachable through a reverse proxy or a tunnel, both of which connect locally.
const LISTEN_HOST = '127.0.0.1';
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

function readEnvOrExit() {
  try {
    return parseApiEnv(process.env);
  } catch (error) {
    if (error instanceof InvalidEnvError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const env = readEnvOrExit();
const server = await buildServer({ env, isLoggingEnabled: true });

for (const signal of SHUTDOWN_SIGNALS) {
  process.once(signal, async () => {
    server.log.info({ signal }, 'shutting down');
    await server.close();
    process.exit(0);
  });
}

await server.listen({ port: env.PORT, host: LISTEN_HOST });
