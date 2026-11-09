import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { createApp } from '../src/app.js';
import { fingerprint } from '../src/security.js';
import { Sessions } from '../src/sessions.js';
import { SupabaseGateway } from '../src/supabase.js';
import { config, TestStore, Upstream } from './helpers.js';

class Browser {
  readonly cookies = new Map<string, string>();
  csrf = '';
  constructor(private readonly app: FastifyInstance) {}
  async request(url: string, method: InjectOptions['method'] = 'GET', body?: unknown, extra: Record<string, string> = {}) {
    const response = await this.app.inject({ url, method, headers: { origin: config.origin,
      cookie: this.cookieHeader(), ...(method !== 'GET' && method !== 'HEAD' ? {
        'x-csrf-token': this.csrf, 'content-type': 'application/json',
      } : {}), ...extra }, ...(body === undefined ? {} : { payload: JSON.stringify(body) }) });
    for (const item of response.cookies) {
      if (!item.value || item.maxAge === 0) this.cookies.delete(item.name);
      else this.cookies.set(item.name, item.value);
    }
    return response;
  }
  cookieHeader() { return [...this.cookies].map(([key, value]) => key + '=' + value).join('; '); }
  async initialize() { this.csrf = (await this.request('/api/csrf')).json<{ csrfToken: string }>().csrfToken; }
  login(audience: string, name = audience) {
    return this.request(`/api/${audience}/auth/login`, 'POST', { email: name + '@example.com', password: 'correct', remember: true });
  }
}
async function setup() {
  const upstream = new Upstream(), store = new TestStore();
  upstream.roleOverrides.set('victim', 'customer');
  const app = await createApp(config, store, upstream.fetch);
  const initiator = new Browser(app), recipient = new Browser(app);
  await initiator.initialize(); await recipient.initialize();
  const sessions = new Sessions(store, new SupabaseGateway(config, upstream.fetch), config);
  const start = async (browser: Browser, kind = 'recovery') => {
    const body = kind === 'recovery' ? { email: 'customer@example.com' } : kind === 'oauth' ? { remember: true }
      : { email: 'customer@example.com', password: 'correct', fullName: 'Name', phone: '123' };
    await browser.request('/api/customer/auth/' + kind, 'POST', body);
    return browser.cookies.get('__Host-nestora-customer-flow')!;
  };
  return { app, upstream, store, initiator, recipient, sessions, start };
}
const pendingCookie = '__Host-nestora-customer-recovery-confirmation';
const confirmation = '/api/customer/auth/recovery-confirmation';
const callback = '/api/customer/auth/callback';

test('HEAD callbacks have no flow, cookie, session or upstream authentication effects for either audience', async () => {
  const { app, initiator, store, upstream, start } = await setup();
  try {
    await initiator.login('admin'); await initiator.login('customer');
    const flow = await start(initiator, 'oauth');
    const before = initiator.cookieHeader(), calls = upstream.requests.length;
    const flowRecord = await store.get('nestora:flow:customer:' + fingerprint(flow));
    for (const audience of ['admin', 'customer']) for (const query of ['', '?code=valid-code', '?flow=' + flow + '&code=recovery-code']) {
      const response = await initiator.request(`/api/${audience}/auth/callback` + query, 'HEAD');
      assert.equal(response.statusCode, 405); assert.equal(response.headers.allow, 'GET');
      assert.equal(response.cookies.length, 0); assert.ok(initiator.cookieHeader() === before);
    }
    assert.ok(await store.get('nestora:flow:customer:' + fingerprint(flow)) === flowRecord);
    assert.equal(upstream.requests.length, calls);
    assert.equal((await initiator.request(callback + '?code=valid-code')).headers.location, '/auth/customer-callback');
  } finally { await app.close(); }
});

test('invalid GET callbacks preserve the current flow and cookie, including failed exchanges and unrelated IDs', async () => {
  const { app, initiator, store, start } = await setup();
  try {
    for (const kind of ['oauth', 'register', 'recovery']) {
      const flow = await start(initiator, kind);
      const key = 'nestora:flow:customer:' + fingerprint(flow);
      for (const query of ['', '?code=', '?code=bad-code', '?code=valid-code&code=duplicate', '?code=valid-code&error=denied', '?flow=' + 'X'.repeat(43) + '&code=valid-code']) {
        const record = await store.get(key);
        const response = await initiator.request(callback + query);
        assert.match(String(response.headers.location), /error=authentication_failed/);
        assert.equal(response.cookies.length, 0);
        assert.ok(await store.get(key) === record);
        assert.ok(initiator.cookies.get('__Host-nestora-customer-flow') === flow);
      }
      const success = await initiator.request(callback + '?code=' + (kind === 'recovery' ? 'recovery-code' : 'valid-code'));
      assert.doesNotMatch(String(success.headers.location), /error=/);
      await initiator.request('/api/customer/auth/logout', 'POST', {});
    }
  } finally { await app.close(); }
});

test('an unbound OAuth callback cannot consume its original browser flow', async () => {
  const { app, initiator, recipient, store, upstream, start } = await setup();
  try {
    const flow = await start(initiator, 'oauth');
    const calls = upstream.requests.length;
    const rejected = await recipient.request(callback + '?flow=' + flow + '&code=valid-code');
    assert.match(String(rejected.headers.location), /error=/);
    assert.ok(await store.get('nestora:flow:customer:' + fingerprint(flow)));
    assert.equal(upstream.requests.length, calls);
    assert.equal((await initiator.request(callback + '?code=valid-code')).headers.location, '/auth/customer-callback');
  } finally { await app.close(); }
});

test('cross-browser recovery preserves the current account until explicit same-origin CSRF-protected confirmation', async () => {
  const { app, initiator, recipient, sessions, store, start } = await setup();
  try {
    await recipient.login('admin'); await recipient.login('customer', 'victim');
    const old = recipient.cookies.get('__Host-nestora-customer')!;
    const admin = recipient.cookies.get('__Host-nestora-admin');
    const flow = await start(initiator);
    const response = await recipient.request(callback + '?flow=' + flow + '&code=recovery-code', 'GET', undefined, { 'sec-fetch-site': 'cross-site' });
    assert.equal(response.headers.location, '/auth/customer-reset-password?confirmation=required');
    assert.ok(recipient.cookies.get('__Host-nestora-customer') === old);
    assert.ok(await store.get(sessions.key('customer', old)));
    assert.equal((await recipient.request('/api/customer/auth/session')).json().user.id, 'victim-id');
    const cookie = response.cookies.find((item) => item.name === pendingCookie);
    assert.ok(cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Lax' && cookie.maxAge && cookie.maxAge <= 600);
    assert.equal(response.cookies.some((item) => item.name === '__Host-nestora-customer'), false);
    const details = await recipient.request(confirmation);
    assert.deepEqual(details.json(), { email: 'customer@example.com' });
    assert.doesNotMatch(details.body, /access_token|refresh_token|sessionId|recovery-code|eyJ/);
    assert.equal((await recipient.request(confirmation, 'POST', { confirm: true }, { origin: 'https://evil.test' })).statusCode, 403);
    assert.equal((await recipient.request(confirmation, 'POST', { confirm: true }, { 'x-csrf-token': 'wrong' })).statusCode, 403);
    assert.equal((await recipient.request(confirmation, 'POST', {})).statusCode, 400);
    const confirmed = await recipient.request(confirmation, 'POST', { confirm: true });
    assert.equal(confirmed.statusCode, 200); assert.deepEqual(confirmed.json(), { confirmed: true });
    assert.equal(await store.get(sessions.key('customer', old)), null);
    assert.equal((await recipient.request('/api/customer/auth/session')).json().recovery, true);
    assert.equal((await recipient.request('/api/customer/supabase/rest/v1/orders')).statusCode, 403);
    assert.ok(recipient.cookies.get('__Host-nestora-admin') === admin);
    assert.equal((await recipient.request('/api/admin/auth/session')).statusCode, 200);
    assert.equal((await recipient.request(confirmation, 'POST', { confirm: true })).statusCode, 400);
  } finally { await app.close(); }
});

test('logged-out cross-browser recovery remains immediate and restricted to password recovery', async () => {
  const { app, initiator, recipient, start } = await setup();
  try {
    const flow = await start(initiator);
    assert.equal((await recipient.request(callback + '?flow=' + flow + '&code=recovery-code')).headers.location, '/auth/customer-reset-password');
    assert.equal(recipient.cookies.has(pendingCookie), false);
    assert.equal((await recipient.request('/api/customer/auth/session')).json().recovery, true);
    assert.equal((await recipient.request('/api/customer/supabase/rest/v1/orders')).statusCode, 403);
    assert.equal((await recipient.request('/api/customer/auth/password', 'POST', { password: 'new-password' })).statusCode, 200);
  } finally { await app.close(); }
});

test('a browser-bound recovery link also requires confirmation before replacing an active session', async () => {
  const { app, initiator, start } = await setup();
  try {
    await initiator.login('customer'); const old = initiator.cookies.get('__Host-nestora-customer');
    await start(initiator);
    const response = await initiator.request(callback + '?code=recovery-code');
    assert.equal(response.headers.location, '/auth/customer-reset-password?confirmation=required');
    assert.ok(initiator.cookies.get('__Host-nestora-customer') === old);
    assert.equal((await initiator.request('/api/customer/auth/session')).json().recovery, false);
    assert.equal((await initiator.request(confirmation, 'POST', { confirm: true })).statusCode, 200);
    assert.equal((await initiator.request('/api/customer/auth/session')).json().recovery, true);
  } finally { await app.close(); }
});

test('confirmation is invalidated by logout or by a different current session', async () => {
  for (const action of ['logout', 'initiator-logout', 'reauthenticate']) {
    const { app, initiator, recipient, start } = await setup();
    try {
      await recipient.login('customer', 'victim');
      const flow = await start(initiator);
      await recipient.request(callback + '?flow=' + flow + '&code=recovery-code');
      const before = recipient.cookieHeader();
      if (action === 'logout') await recipient.request('/api/customer/auth/logout', 'POST', {});
      else if (action === 'initiator-logout') await initiator.request('/api/customer/auth/logout', 'POST', {});
      else await recipient.login('customer', 'victim');
      const result = await recipient.request(confirmation, 'POST', { confirm: true });
      assert.ok([400, 409].includes(result.statusCode));
      assert.equal(result.cookies.length, 0);
      if (action === 'logout') {
        const replay = await recipient.request(confirmation, 'POST', { confirm: true }, { cookie: before });
        assert.ok([400, 409].includes(replay.statusCode));
      } else assert.equal((await recipient.request('/api/customer/auth/session')).json().user.id, 'victim-id');
    } finally { await app.close(); }
  }
});

test('confirmation is single-use when submitted concurrently', async () => {
  const { app, initiator, recipient, start } = await setup();
  try {
    await recipient.login('customer', 'victim'); const flow = await start(initiator);
    await recipient.request(callback + '?flow=' + flow + '&code=recovery-code');
    const cookie = recipient.cookieHeader();
    const responses = await Promise.all(Array.from({ length: 2 }, () =>
      recipient.request(confirmation, 'POST', { confirm: true }, { cookie })));
    assert.equal(responses.filter((item) => item.statusCode === 200).length, 1);
    assert.equal(responses.filter((item) => [400, 409].includes(item.statusCode)).length, 1);
    assert.equal((await recipient.request('/api/customer/auth/session')).json().recovery, true);
  } finally { await app.close(); }
});

test('logout during confirmation cannot restore the newly issued recovery cookie', async () => {
  const { app, initiator, recipient, upstream, start } = await setup();
  let release!: () => void, entered!: () => void;
  const pause = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  try {
    await recipient.login('customer', 'victim'); const flow = await start(initiator);
    await recipient.request(callback + '?flow=' + flow + '&code=recovery-code');
    const cookie = recipient.cookieHeader(); let calls = 0;
    upstream.beforeLogout = async () => { if (++calls === 1) { entered(); await pause; } };
    const confirming = recipient.request(confirmation, 'POST', { confirm: true });
    await started;
    assert.equal((await recipient.request('/api/customer/auth/logout', 'POST', {}, { cookie })).statusCode, 200);
    release();
    const result = await confirming;
    assert.equal(result.statusCode, 200);
    const issued = recipient.cookies.get('__Host-nestora-customer');
    assert.equal((await recipient.request('/api/customer/auth/session', 'GET', undefined, {
      cookie: '__Host-nestora-customer=' + issued,
    })).statusCode, 401);
  } finally { release?.(); await app.close(); }
});

test('concurrent callbacks exchange once and an invalid competing callback cannot destroy the winner', async () => {
  const { app, initiator, upstream, start } = await setup();
  let release!: () => void, entered!: () => void;
  const pause = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  upstream.beforeCodeExchange = async () => { entered(); await pause; };
  try {
    await start(initiator, 'oauth');
    const first = initiator.request(callback + '?code=valid-code');
    await started;
    const competing = await initiator.request(callback + '?code=valid-code');
    assert.match(String(competing.headers.location), /error=/); assert.equal(competing.cookies.length, 0);
    release();
    assert.equal((await first).headers.location, '/auth/customer-callback');
    assert.equal(upstream.requests.filter((item) => item.url.includes('grant_type=pkce')).length, 1);
  } finally { release(); await app.close(); }
});

test('recipient logout during an unbound recovery exchange cancels new session issuance', async () => {
  const { app, initiator, recipient, upstream, store, start } = await setup();
  let release!: () => void, entered!: () => void;
  const pause = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  upstream.beforeCodeExchange = async () => { entered(); await pause; };
  try {
    await recipient.login('customer', 'victim'); const flow = await start(initiator);
    const pending = recipient.request(callback + '?flow=' + flow + '&code=recovery-code');
    await started;
    assert.equal((await recipient.request('/api/customer/auth/logout', 'POST', {})).statusCode, 200);
    release(); const response = await pending;
    assert.match(String(response.headers.location), /error=/);
    assert.equal(response.cookies.length, 0);
    assert.equal([...store.records.keys()].filter((key) => key.startsWith('nestora:session:customer:')).length, 0);
  } finally { release(); await app.close(); }
});
