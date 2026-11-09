import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { RedisStore } from './store.js';

const config = loadConfig();
const store = new RedisStore(config.redisUrl);
try {
  await store.connect();
  const app = await createApp(config, store);
  await app.listen({ host: '127.0.0.1', port: config.port });
  console.info(`Nestora BFF listening on loopback port ${config.port}; enabled=${config.enabled}`);
  const shutdown = async (): Promise<void> => { await app.close(); await store.close(); process.exit(0); };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
} catch {
  await store.close().catch(() => undefined);
  console.error('BFF startup failed. Check required configuration and shared-store availability.');
  process.exitCode = 1;
}
