import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { dataRoute } from '../src/policy.js';
import { loadConfig } from '../src/config.js';

async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => entry.isDirectory() ? sources(path.join(directory, entry.name))
    : entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [await readFile(path.join(directory, entry.name), 'utf8')] : []))).flat();
}
test('every literal application table and RPC is covered by an explicit BFF route', async () => {
  const code = (await sources(fileURLToPath(new URL('../../src/app/', import.meta.url)))).join('\n');
  for (const [kind, method] of [['from', 'GET'], ['rpc', 'POST']] as const) {
    const names = new Set([...code.matchAll(new RegExp('\\.' + kind + "\\(\\s*'([a-z_][a-z0-9_]*)'", 'g'))].map((m) => m[1]!));
    for (const name of names) {
      const route = 'rest/v1/' + (kind === 'rpc' ? 'rpc/' : '') + name;
      const covered = ['customer', 'admin'].some((audience) => {
        try { dataRoute(audience as 'customer' | 'admin', route, method); return true; } catch { return false; }
      });
      assert.ok(covered, 'Uncovered source ' + kind + ': ' + name);
    }
  }
});
test('production configuration rejects insecure origins, plaintext Redis and service credentials', () => {
  const env = { NODE_ENV: 'production', BFF_ORIGIN: 'https://nestora.test', SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', REDIS_URL: 'rediss://redis.test', BFF_SESSION_KEY: Buffer.alloc(32, 7).toString('base64') };
  assert.equal(loadConfig(env).enabled, false);
  assert.throws(() => loadConfig({ ...env, REDIS_URL: 'redis://redis.test' }));
  assert.throws(() => loadConfig({ ...env, BFF_ORIGIN: 'http://nestora.test' }));
  assert.throws(() => loadConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_forbidden' }));
});
