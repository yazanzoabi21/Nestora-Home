import { readFile } from 'node:fs/promises';

// Use the same backend target as Angular; never load server secrets into the client.
const proxy = JSON.parse(await readFile(new URL('../proxy.bff.json', import.meta.url), 'utf8'));
const target = proxy['/api/**'].target;

try {
  const response = await fetch(new URL('/api/health', target), {
    signal: AbortSignal.timeout(5000), redirect: 'error',
  });
  const health = await response.json();
  if (!response.ok || health.ready !== true || health.enabled !== true) throw new Error('BFF not ready');
  console.info('Nestora BFF is ready. Keep the cache and BFF running while using Angular.');
} catch {
  console.error(
    'Nestora cannot start: the BFF is unavailable or disabled.\n' +
    'Start Redis, configure bff/.env with BFF_ENABLED=true, then run npm run bff:dev in a separate terminal.\n' +
    'See docs/LOCAL_STARTUP.md. A stopped backend causes Angular /api proxy errors, including HTTP 500.',
  );
  process.exitCode = 1;
}
