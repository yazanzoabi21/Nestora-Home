import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else child.kill('SIGTERM');
  }
  process.exit(code);
}
function launch(command, args, cwd, env = process.env) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  children.add(child);
  child.once('error', () => { console.error('A development service could not start. Check local dependencies.'); stop(1); });
  child.once('exit', (code) => {
    children.delete(child);
    if (!stopping) { console.error('A development service stopped; closing the managed stack.'); stop(code || 1); }
  });
  return child;
}
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
function listening(port, host) {
  return new Promise((done) => {
    const socket = createConnection({ port, host });
    const finish = (ready) => { socket.destroy(); done(ready); };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}
async function waitFor(check, name) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(250);
  }
  throw new Error(`${name} did not become ready within 30 seconds. See docs/LOCAL_STARTUP.md.`);
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());

try {
  const envPath = resolve(root, 'bff/.env');
  const backendEnv = { ...(existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {}), ...process.env };
  if (backendEnv.NODE_ENV === 'production') throw new Error('Use the production service manager in production.');
  if (backendEnv.BFF_ENABLED !== 'true') throw new Error('Configure bff/.env with BFF_ENABLED=true first.');
  const args = process.argv.slice(2);
  const backendOnly = args.includes('--backend-only');
  const portArgument = args.find((arg) => arg.startsWith('--port='))?.slice(7) ??
    (args.includes('--port') ? args[args.indexOf('--port') + 1] : undefined) ??
    (args.length === 1 && /^\d+$/.test(args[0]) ? args[0] : undefined) ?? process.env.npm_config_port;
  const origin = new URL(backendEnv.BFF_ORIGIN);
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) {
    throw new Error('The managed development stack requires an HTTP loopback BFF_ORIGIN.');
  }
  if (portArgument) origin.port = portArgument;
  backendEnv.BFF_ORIGIN = origin.origin;
  const frontendPort = Number(origin.port || 80);
  if (!backendOnly && await listening(frontendPort, origin.hostname)) {
    throw new Error(`Angular port ${frontendPort} is already in use. Stop that server or use npm start -- --port <free-port>.`);
  }
  const redis = new URL(backendEnv.REDIS_URL);
  const redisPort = Number(redis.port || 6379);
  if (!await listening(redisPort, redis.hostname)) {
    const garnet = resolve(root, '.tmp/local-bff-garnet/server/net10.0/GarnetServer.exe');
    if (process.platform !== 'win32' || redis.hostname !== '127.0.0.1' || redisPort !== 6379 ||
      redis.protocol !== 'redis:' || redis.username || redis.password || !existsSync(garnet)) {
      throw new Error('Start the Redis service configured by REDIS_URL before running npm start.');
    }
    console.info('Starting the installed local cache with append-only persistence.');
    launch(garnet, ['--bind', '127.0.0.1', '--port', '6379', '--lua', '--lua-transaction-mode',
      '--memory', '128m', '--index', '16m', '--storage-tier', '--aof', '--aof-commit-wait', '--recover',
      '--logdir', resolve(root, '.tmp/local-bff-garnet/data')], root,
    { ...process.env, DOTNET_ROOT_X64: resolve(root, '.tmp/local-bff-garnet/dotnet') });
    await waitFor(() => listening(redisPort, redis.hostname), 'Redis');
  }
  const proxy = JSON.parse(readFileSync(resolve(root, 'proxy.bff.json'), 'utf8'));
  const target = new URL(proxy['/api/**'].target);
  if (Number(backendEnv.PORT || 3000) !== Number(target.port || 80)) {
    throw new Error('BFF PORT must match proxy.bff.json.');
  }
  const healthy = async () => {
    try {
      const response = await fetch(new URL('/api/health', target), { signal: AbortSignal.timeout(1500) });
      const health = await response.json();
      return response.ok && health.ready === true && health.enabled === true && health.origin === origin.origin;
    } catch { return false; }
  };
  if (await listening(Number(target.port), target.hostname)) {
    if (!await healthy()) throw new Error('The BFF port is occupied, unhealthy, or configured for a different BFF_ORIGIN.');
    console.info('Using the existing healthy BFF with a matching origin.');
  } else {
    console.info('Starting the BFF and waiting for Redis-backed readiness.');
    launch(process.execPath, ['--import', 'tsx', '--watch', 'src/main.ts'], resolve(root, 'bff'), backendEnv);
    await waitFor(healthy, 'BFF');
  }
  if (backendOnly) {
    console.info(`Nestora backend is ready for the existing Angular server at ${origin.origin}.`);
  } else {
  console.info(`Starting Nestora Angular at ${origin.origin}. Ctrl+C stops services launched here.`);
  // Server-only variables from bff/.env are never passed to the Angular process.
  launch(process.execPath, [resolve(root, 'node_modules/@angular/cli/bin/ng.js'), 'serve',
    '--configuration', 'bff', '--host', origin.hostname, '--port', String(frontendPort),
    ...args.filter((arg, index) => arg !== '--port' && args[index - 1] !== '--port' &&
      !arg.startsWith('--port=') && !(args.length === 1 && /^\d+$/.test(arg)))], root);
  }
} catch (error) {
  // Do not print arbitrary configuration/URL parsing errors, which can contain secrets.
  console.error(error instanceof TypeError ? 'Invalid development configuration; check bff/.env.' : error.message);
  stop(1);
}
