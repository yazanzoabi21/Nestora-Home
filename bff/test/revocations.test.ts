import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sessions } from '../src/sessions.js';
import { SupabaseGateway } from '../src/supabase.js';
import { config, TestStore, Upstream } from './helpers.js';

interface StoredJob { state: string; accessToken?: string; expiresAt: number; attempts?: number; nextAttemptAt?: number }
function fixture() {
  const store = new TestStore(); const upstream = new Upstream();
  const gateway = new SupabaseGateway(config, upstream.fetch);
  const sessions = new Sessions(store, gateway, config);
  const read = async (key: string) => sessions.vault.open<StoredJob>((await store.get(key))!, key);
  const due = async (key: string) => {
    const record = await read(key); record.nextAttemptAt = Date.now() - 1;
    await store.set(key, sessions.vault.seal(record, key), Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000)));
  };
  return { store, upstream, gateway, sessions, read, due };
}

for (const [status, code, expected, retryable] of [
  [204, null, 'confirmed', false], [401, 'bad_jwt', 'already_invalid', false],
  [401, 'session_not_found', 'already_invalid', false], [403, 'not_admin', 'uncertain', false],
  [401, null, 'uncertain', false], [404, null, 'uncertain', false],
  [400, 'validation_failed', 'uncertain', false], [408, null, 'uncertain', true],
  [429, null, 'uncertain', true], [503, null, 'uncertain', true],
] as const) {
  test(`revocation classifies HTTP ${status}/${code ?? 'no-code'} without assuming success`, async () => {
    const { upstream, gateway } = fixture();
    upstream.logoutStatus = status === 204 ? null : status; upstream.logoutCode = code;
    const result = await gateway.revoke(upstream.issue('customer').access_token);
    assert.equal(result.status, expected); assert.equal(result.retryable, retryable);
    assert.ok(upstream.requests.every((request) => request.url.endsWith('/auth/v1/logout?scope=local') && request.method === 'POST'));
  });
}

test('encrypted durable retries survive a new worker and remove credentials on success without restoring sessions', async () => {
  const { store, upstream, gateway, sessions, read, due } = fixture();
  const created = await sessions.create('customer', upstream.issue('customer'), true);
  const key = sessions.revocations.key('customer', created.id);
  upstream.logoutNetworkFailure = true;
  assert.deepEqual(await sessions.logout('customer', created.id), { status: 'uncertain', retryScheduled: true });
  assert.equal(await store.get(sessions.key('customer', created.id)), null);
  await assert.rejects(sessions.resolve('customer', created.id));
  const encrypted = (await store.get(key))!;
  assert.doesNotMatch(encrypted, /accessToken|server-only|eyJ/);
  assert.throws(() => sessions.vault.open(encrypted, key + ':wrong-context'));
  const pending = await read(key);
  assert.equal(pending.attempts, 1);
  assert.ok(pending.expiresAt <= Date.now() + 15 * 60 * 1000);
  assert.ok(pending.nextAttemptAt! > Date.now());
  upstream.logoutNetworkFailure = false; await due(key);
  const restarted = new Sessions(store, gateway, config);
  await restarted.revocations.drain();
  const finished = await read(key);
  assert.equal(finished.state, 'confirmed'); assert.equal(finished.accessToken, undefined);
  assert.equal(await store.get(sessions.key('customer', created.id)), null);
  assert.equal(upstream.refreshCount, 0);
  assert.equal(upstream.requests.filter((request) => request.url.includes('/logout')).length, 2);
});

test('five attempts are a hard bound and repeated logout cannot reset failed jobs', async () => {
  const { upstream, sessions, read, due } = fixture();
  const created = await sessions.create('admin', upstream.issue('admin'), true);
  const key = sessions.revocations.key('admin', created.id);
  upstream.logoutFailure = true;
  await sessions.logout('admin', created.id);
  for (let attempt = 2; attempt <= 5; attempt++) { await due(key); await sessions.revocations.process(key); }
  assert.equal((await read(key)).state, 'uncertain');
  assert.equal((await read(key)).accessToken, undefined);
  for (let repeat = 0; repeat < 3; repeat++) {
    assert.deepEqual(await sessions.logout('admin', created.id), { status: 'uncertain', retryScheduled: false });
  }
  assert.equal(upstream.requests.filter((request) => request.url.includes('/logout')).length, 5);
  assert.equal(upstream.refreshCount, 0);
});

test('expired jobs and expired access credentials are never refreshed or kept indefinitely', async () => {
  const { store, upstream, sessions, read } = fixture();
  const created = await sessions.create('customer', upstream.issue('customer'), true);
  const key = sessions.revocations.key('customer', created.id);
  upstream.logoutFailure = true; await sessions.logout('customer', created.id);
  const record = await read(key); record.expiresAt = Date.now() - 1;
  await store.set(key, sessions.vault.seal(record, key), 60);
  assert.deepEqual(await sessions.revocations.process(key), { status: 'uncertain', retryScheduled: false });
  assert.equal(await store.get(key), null);
  const tokens = upstream.issue('admin'); tokens.expires_at = Math.floor(Date.now() / 1000) - 1;
  const expired = await sessions.create('admin', tokens, false);
  assert.deepEqual(await sessions.logout('admin', expired.id), { status: 'already_invalid', retryScheduled: false });
  assert.equal(await store.get(sessions.key('admin', expired.id)), null);
  assert.equal(upstream.refreshCount, 0);
  assert.equal(upstream.requests.filter((request) => request.url.includes('/logout')).length, 1);
});

test('non-retryable auth and endpoint errors discard credentials and never report confirmed revocation', async () => {
  for (const [status, code, expected] of [[401, 'bad_jwt', 'already_invalid'], [403, null, 'uncertain'], [404, null, 'uncertain']] as const) {
    const { upstream, sessions, read } = fixture();
    const created = await sessions.create('customer', upstream.issue('customer'), true);
    upstream.logoutStatus = status; upstream.logoutCode = code;
    const result = await sessions.logout('customer', created.id);
    assert.deepEqual(result, { status: expected, retryScheduled: false });
    const record = await read(sessions.revocations.key('customer', created.id));
    assert.equal(record.accessToken, undefined);
    assert.deepEqual(await sessions.logout('customer', created.id), result);
    assert.equal(upstream.requests.filter((request) => request.url.includes('/logout')).length, 1);
  }
});

test('concurrent logout and workers do not wait for Supabase under the session lock or issue SESSION_BUSY', { timeout: 5000 }, async () => {
  const { upstream, sessions, store } = fixture();
  const created = await sessions.create('admin', upstream.issue('admin'), false);
  let release!: () => void; let started!: () => void;
  const paused = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { started = resolve; });
  upstream.beforeLogout = async () => { started(); await paused; };
  const first = sessions.logout('admin', created.id);
  try {
    await entered;
    assert.equal(await store.get(sessions.key('admin', created.id)), null);
    await assert.rejects(sessions.resolve('admin', created.id), { code: 'SESSION_EXPIRED' });
    const key = sessions.revocations.key('admin', created.id);
    const concurrent = await Promise.all([
      ...Array.from({ length: 8 }, () => sessions.logout('admin', created.id)),
      sessions.revocations.process(key), new Sessions(store, sessions.gateway, config).revocations.process(key),
    ]);
    assert.ok(concurrent.every((result) => result.status === 'uncertain'));
    assert.equal(upstream.requests.filter((request) => request.url.includes('/logout')).length, 1);
    release();
    assert.deepEqual(await first, { status: 'confirmed', retryScheduled: false });
    assert.deepEqual(await sessions.logout('admin', created.id), { status: 'confirmed', retryScheduled: false });
  } finally { release(); await first; }
});

test('retrying Admin revocation cannot affect Customer authentication or another device', async () => {
  const { upstream, sessions, due } = fixture();
  const adminTokens = upstream.issue('admin');
  const admin = await sessions.create('admin', adminTokens, false);
  const customer = await sessions.create('customer', upstream.issue('customer'), true);
  upstream.logoutFailure = true; await sessions.logout('admin', admin.id);
  assert.equal((await sessions.resolve('customer', customer.id)).session.user.id, 'customer-id');
  upstream.logoutFailure = false; await due(sessions.revocations.key('admin', admin.id));
  await sessions.revocations.drain();
  assert.equal((await sessions.resolve('customer', customer.id)).session.user.id, 'customer-id');
  const requests = upstream.requests.filter((request) => request.url.includes('/logout'));
  assert.ok(requests.every((request) => request.url.endsWith('?scope=local') && request.authorization === 'Bearer ' + adminTokens.access_token));
  assert.equal(upstream.refreshCount, 0);
});

test('Retry-After is honored and a delay beyond the credential deadline is not retried early', async () => {
  for (const retryAfter of ['60', '3600']) {
    const { store, upstream, sessions, read } = fixture();
    const gateway = new SupabaseGateway(config, async () => new Response('{}', { status: 429, headers: { 'retry-after': retryAfter } }));
    const worker = new Sessions(store, gateway, config).revocations;
    const key = worker.key('customer', 'fixture');
    const prepared = worker.prepare(key, upstream.issue('customer').access_token, Date.now() + 3600_000)!;
    await store.set(key, prepared.value, prepared.seconds);
    const before = Date.now(); const result = await worker.process(key);
    const record = await read(key);
    if (retryAfter === '60') {
      assert.equal(result.retryScheduled, true); assert.ok(record.nextAttemptAt! >= before + 60_000);
    } else {
      assert.equal(result.retryScheduled, false); assert.equal(record.accessToken, undefined);
    }
  }
});
