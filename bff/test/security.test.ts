import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vault, assertTokenFree } from '../src/security.js';
import { config } from './helpers.js';

test('encrypted session records authenticate their Redis key and cannot be transplanted', () => {
  const vault = new Vault(config.encryptionKey);
  const value = vault.seal({ accessToken: 'test-secret' }, 'customer:original');
  assert.deepEqual(vault.open(value, 'customer:original'), { accessToken: 'test-secret' });
  assert.throws(() => vault.open(value, 'admin:original'));
  assert.throws(() => vault.open(value, 'customer:another'));
});
test('egress guard rejects nested credentials and JWTs under unrelated field names', () => {
  for (const response of [{ data: { access_token: 'secret' } }, { content: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature' }]) {
    assert.throws(() => assertTokenFree(response));
  }
  assert.doesNotThrow(() => assertTokenFree({ session: { user: { id: 'user-id' } } }));
});
