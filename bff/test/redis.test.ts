import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RedisStore } from '../src/store.js';
import { opaqueId } from '../src/security.js';

test('real shared Redis: serialized leases, fenced writes, expiry and atomic one-time reads', {
  skip: !process.env['BFF_TEST_REDIS_URL'] && 'Set BFF_TEST_REDIS_URL to a disposable Redis database; no production Redis is touched.',
}, async () => {
  const store = new RedisStore(process.env['BFF_TEST_REDIS_URL']!);
  await store.connect();
  const key = `nestora:test:{${opaqueId()}}`;
  try {
    await store.ping(); await store.set(key, '0', 30);
    await Promise.all(Array.from({ length: 8 }, () => store.lock(key, async (lease) => {
      const current = Number(await store.get(key));
      await store.set(key, String(current + 1), 30, lease);
    })));
    assert.equal(await store.get(key), '8');
    await assert.rejects(() => store.set(key, 'forged', 30, { key: key + ':lock', token: 'invalid' }));
    assert.equal(await store.take(key), '8'); assert.equal(await store.take(key), null);
    await store.set(key, 'short-lived', 1);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(await store.get(key), null);
  } finally { await store.delete(key); await store.close(); }
});

test('real shared Redis: atomic logout outbox and non-blocking fenced revocation claims', {
  skip: !process.env['BFF_TEST_REDIS_URL'] && 'Set BFF_TEST_REDIS_URL to a disposable Redis database.',
}, async () => {
  const store = new RedisStore(process.env['BFF_TEST_REDIS_URL']!);
  await store.connect();
  const key = `nestora:test:{${opaqueId()}}`;
  const pending = { key: key + ':revocation', value: 'encrypted-fixture', seconds: 30 };
  try {
    await store.set(key, 'session-fixture', 30);
    await assert.rejects(store.delete(key, { key: key + ':lock', token: 'wrong' }, pending));
    assert.equal(await store.get(key), 'session-fixture');
    assert.equal(await store.get(pending.key), null);
    await store.lock(key, (lease) => store.delete(key, lease, pending));
    assert.equal(await store.get(key), null);
    assert.equal(await store.get(pending.key), pending.value);
    await store.lock(key, (lease) => store.delete(key, lease, { ...pending, value: 'must-not-reset-job' }));
    assert.equal(await store.get(pending.key), pending.value);
    const lease = await store.tryLease(pending.key);
    assert.ok(lease);
    assert.equal(await store.tryLease(pending.key), null);
    await store.releaseLease({ ...lease, token: 'wrong' });
    assert.equal(await store.tryLease(pending.key), null);
    await store.set(pending.key, 'updated-fixture', 30, lease);
    await store.releaseLease(lease);
    await assert.rejects(store.set(pending.key, 'stale-worker', 30, lease));
    const next = await store.tryLease(pending.key); assert.ok(next);
    await store.releaseLease(next);
    const page = await store.scanRevocations('0');
    assert.equal(typeof page.cursor, 'string'); assert.ok(Array.isArray(page.keys));
  } finally { await store.delete(key); await store.delete(pending.key); await store.close(); }
});
