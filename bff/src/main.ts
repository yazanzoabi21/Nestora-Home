import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { RedisStore } from './store.js';

let store: RedisStore | undefined;
let app: Awaited<ReturnType<typeof createApp>> | undefined;
let stage = 'configuration';
try {
  const config = loadConfig();
  store = new RedisStore(config.redisUrl);
  stage = 'Redis connection';
  const started = performance.now();
  await store.connect();
  if (!config.production && process.env['BFF_TRACE_TIMING'] === '1') {
    console.info('BFF Redis connect ms', Math.round(performance.now() - started));
  }
  stage = 'application initialization';
  app = await createApp(config, store);
  stage = 'HTTP listener (check PORT conflicts)';
  await app.listen({ host: '127.0.0.1', port: config.port });
  console.info(`Nestora BFF listening on loopback port ${config.port}; enabled=${config.enabled}`);
  const shutdown = async (): Promise<void> => { await app?.close(); await store?.close(); process.exit(0); };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
} catch (error: unknown) {
  await app?.close().catch(() => undefined);
  await store?.close().catch(() => undefined);
  // Only configuration validation messages are safe to print, never connection URLs.
  console.error(`BFF startup failed during ${stage}.`,
    stage === 'configuration' && error instanceof Error && error.name === 'Error'
      ? error.message : 'Check required configuration, service availability and local ports.');
  process.exitCode = 1;
}
