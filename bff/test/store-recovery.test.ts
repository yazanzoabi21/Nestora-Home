import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { RedisStore } from '../src/store.js';
import { createApp } from '../src/app.js';
import { config } from './helpers.js';

test('real Redis-compatible store reconnects after process interruption and restores durable records', {
  skip: (process.platform !== 'win32' || !process.env['BFF_TEST_GARNET_ROOT']) &&
    'Set BFF_TEST_GARNET_ROOT to a local disposable Garnet installation on Windows.',
  timeout: 60_000,
}, async () => {
  const root = resolve(process.env['BFF_TEST_GARNET_ROOT']!);
  const probe = createServer();
  probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const address = probe.address(); assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((done, reject) => probe.close((error) => error ? reject(error) : done()));
  const data = await mkdtemp(join(tmpdir(), 'nestora-store-recovery-'));
  let cache: ChildProcess | undefined;
  const start = () => {
    cache = spawn(join(root, 'server/net10.0/GarnetServer.exe'), [
      '--bind', '127.0.0.1', '--port', String(port), '--lua', '--lua-transaction-mode',
      '--memory', '128m', '--index', '16m', '--storage-tier', '--aof', '--aof-commit-wait',
      '--recover', '--logdir', data,
    ], { env: { ...process.env, DOTNET_ROOT_X64: join(root, 'dotnet') }, windowsHide: true, stdio: 'ignore' });
  };
  const stop = async () => {
    if (!cache || cache.exitCode !== null) return;
    const exited = once(cache, 'exit'); cache.kill(); await exited;
  };
  const store = new RedisStore(`redis://127.0.0.1:${port}`);
  const app = await createApp(config, store);
  const waitReady = async () => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try { await store.ping(); return; } catch { await new Promise((done) => setTimeout(done, 100)); }
    }
    assert.fail('Shared store did not recover');
  };
  try {
    // Connect before the store exists to exercise startup retry too.
    const connecting = store.connect(); start(); await connecting;
    await store.set('nestora:test:durable', 'retained', 120);
    assert.equal((await app.inject('/api/csrf')).statusCode, 200);
    await stop();
    await assert.rejects(store.ping());
    const unavailable = await app.inject('/api/csrf');
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.cookies.length, 0);
    start(); await waitReady();
    assert.equal(await store.get('nestora:test:durable'), 'retained');
    assert.equal((await app.inject('/api/csrf')).statusCode, 200);
    assert.equal((await app.inject('/api/health')).statusCode, 200);
  } finally { await app.close(); await store.close(); await stop(); }
});
