import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { createApp } from '../src/app.js';
import { Sessions, type ServerSession } from '../src/sessions.js';
import { SupabaseGateway } from '../src/supabase.js';
import { config, TestStore, Upstream } from './helpers.js';
import { fingerprint } from '../src/security.js';

class Browser {
  readonly cookies = new Map<string, string>();
  csrf = '';
  constructor(readonly app: FastifyInstance) {}
  async request(url: string, method: InjectOptions['method'] = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const response = await this.app.inject({ url, method, headers: {
      origin: config.origin, cookie: [...this.cookies].map(([k, v]) => k + '=' + v).join('; '),
      ...(method !== 'GET' ? { 'x-csrf-token': this.csrf, 'content-type': 'application/json' } : {}), ...headers,
    }, ...(body === undefined ? {} : { payload: JSON.stringify(body) }) });
    for (const cookie of response.cookies) {
      if (!cookie.value || cookie.maxAge === 0) this.cookies.delete(cookie.name);
      else this.cookies.set(cookie.name, cookie.value);
    }
    return response;
  }
  async initialize() { const response = await this.request('/api/csrf'); this.csrf = response.json<{ csrfToken: string }>().csrfToken; }
  login(audience: string, email = audience + '@example.com', remember = true) {
    return this.request('/api/' + audience + '/auth/login', 'POST', { email, password: 'correct', remember });
  }
}
async function setup() {
  const store = new TestStore(); const upstream = new Upstream();
  const app = await createApp(config, store, upstream.fetch);
  const browser = new Browser(app); await browser.initialize();
  return { app, store, upstream, browser, sessions: new Sessions(store, new SupabaseGateway(config, upstream.fetch), config) };
}

test('clean guests initialize CSRF and read the public catalogue without an auth session', async () => {
  const { app, browser, upstream } = await setup();
  try {
    assert.ok(browser.csrf);
    assert.equal(browser.cookies.has('__Host-nestora-customer'), false);
    assert.deepEqual((await browser.request('/api/customer/auth/session')).json(), {
      user: null, session: null, profile: null, recovery: false,
    });
    for (const table of ['products', 'product_variants', 'categories', 'promotions',
      'promotion_products', 'discounts', 'discount_gift_products']) {
      for (const method of ['GET', 'HEAD'] as const) {
        const response = await browser.request(`/api/customer/supabase/rest/v1/${table}?is_active=eq.true`, method);
        assert.equal(response.statusCode, 200, response.body);
        assert.equal(upstream.requests.at(-1)?.authorization, 'Bearer ' + config.supabaseKey);
      }
    }
    const reads = upstream.requests.length;
    for (const audience of ['customer', 'admin']) {
      for (const table of ['carts', 'cart_items', 'orders', 'profiles', 'customer_addresses']) {
        assert.equal((await browser.request(`/api/${audience}/supabase/rest/v1/${table}`)).statusCode, 401);
      }
      assert.equal((await browser.request(`/api/${audience}/auth/refresh`, 'POST', {})).statusCode, 401);
    }
    assert.equal(upstream.requests.length, reads, 'Denied operations must not reach Supabase');
    assert.ok(upstream.requests.every((request) => !request.url.includes('/auth/v1/')));
  } finally { await app.close(); }
});

test('backend outages are explicit service errors even for guest CSRF and session checks', async () => {
  const { app, browser, store } = await setup();
  try {
    store.fail = true;
    for (const path of ['csrf', 'customer/auth/session', 'customer/supabase/rest/v1/products']) {
      const response = await browser.request('/api/' + path);
      assert.equal(response.statusCode, 503);
      assert.equal(response.json().code, 'SERVICE_UNAVAILABLE');
    }
  } finally { await app.close(); }
});

test('Admin and Customer login return only sanitized identities and opaque secure cookies', async () => {
  const { app, store, upstream, browser } = await setup();
  try {
    for (const audience of ['admin', 'customer']) {
      const response = await browser.login(audience);
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().user.id, audience + '-id');
      assert.deepEqual(Object.keys(response.json().session), ['user']);
      assert.doesNotMatch(response.body, /access_token|refresh_token|server-only|eyJ/);
      const cookie = response.cookies.find((c) => c.name === '__Host-nestora-' + audience);
      assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === 'Lax' && cookie.path === '/');
      assert.match(cookie.value, /^[A-Za-z0-9_-]{43}$/);
      assert.ok(cookie.maxAge);
    }
    for (const record of store.records.values()) {
      assert.doesNotMatch(record.value, /server-only|accessToken|refreshToken|eyJ/);
    }
    const before = browser.cookies.get('__Host-nestora-customer');
    await browser.request('/api/admin/auth/logout', 'POST', {});
    assert.equal(browser.cookies.get('__Host-nestora-customer'), before);
    const customer = await browser.request('/api/customer/auth/session');
    assert.equal(customer.statusCode, 200); assert.equal(customer.json().user.id, 'customer-id');
    assert.equal((await browser.request('/api/admin/auth/session')).json().user, null);
    assert.ok(upstream.requests.some((r) => r.authorization?.includes('eyJ')));
  } finally { await app.close(); }
});

test('session-only login omits persistent cookie age and rotates the session ID on reauthentication', async () => {
  const { app, browser } = await setup();
  try {
    const first = await browser.login('customer', 'customer@example.com', false);
    assert.equal(first.cookies.find((c) => c.name === '__Host-nestora-customer')?.maxAge, undefined);
    const old = browser.cookies.get('__Host-nestora-customer');
    await browser.login('customer');
    assert.notEqual(browser.cookies.get('__Host-nestora-customer'), old);
    const stale = await browser.request('/api/customer/auth/session', 'GET', undefined, { cookie: '__Host-nestora-customer=' + old });
    assert.equal(stale.statusCode, 401);
  } finally { await app.close(); }
});

for (const remember of [false, true]) {
  test(`Admin enforces eight hours absolute and thirty minutes idle with remember=${remember}`, async () => {
    const { app, browser, sessions, store } = await setup();
    try {
      const response = await browser.login('admin', 'admin@example.com', remember);
      assert.equal(response.statusCode, 200);
      const cookie = response.cookies.find((item) => item.name === '__Host-nestora-admin');
      assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === 'Lax' && cookie.path === '/');
      assert.ok(cookie.maxAge && cookie.maxAge <= 8 * 3600 && cookie.maxAge >= 8 * 3600 - 2);
      const id = browser.cookies.get('__Host-nestora-admin')!;
      const key = sessions.key('admin', id);
      const session = sessions.vault.open<ServerSession>((await store.get(key))!, key);
      assert.equal(session.remember, false);
      assert.equal(session.absoluteExpiresAt - session.createdAt!, 8 * 3600 * 1000);
      const ttl = store.records.get(key)!.expires - Date.now();
      assert.ok(ttl <= 30 * 60 * 1000 && ttl > 29 * 60 * 1000);
    } finally { await app.close(); }
  });
}

for (const expiry of ['absolute', 'idle', 'legacy'] as const) {
  test(`Admin ${expiry} expiry rejects refresh and cookie reuse without contacting Supabase refresh`, async () => {
    const { app, browser, sessions, store, upstream } = await setup();
    try {
      await browser.login('admin');
      const id = browser.cookies.get('__Host-nestora-admin')!;
      const key = sessions.key('admin', id);
      const session = sessions.vault.open<ServerSession>((await store.get(key))!, key);
      session.tokenExpiresAt = Date.now() - 1000;
      // Simulate a long-lived record surviving a policy change, not just Redis TTL expiry.
      session.absoluteExpiresAt = Date.now() + 30 * 86400 * 1000;
      session.remember = true;
      if (expiry === 'absolute') session.createdAt = Date.now() - 8 * 3600 * 1000 - 1000;
      if (expiry === 'idle') session.lastSeenAt = Date.now() - 30 * 60 * 1000 - 1000;
      if (expiry === 'legacy') delete session.createdAt;
      await store.set(key, sessions.vault.seal(session, key), 600);
      const cookie = [...browser.cookies].map(([name, value]) => name + '=' + value).join('; ');
      for (const [path, method] of [
        ['auth/refresh', 'POST'], ['auth/session', 'GET'], ['supabase/rest/v1/profiles', 'GET'],
      ] as const) {
        const response = await browser.request('/api/admin/' + path, method, method === 'POST' ? {} : undefined, { cookie });
        assert.equal(response.statusCode, 401);
      }
      assert.equal(await store.get(key), null);
      assert.equal(upstream.refreshCount, 0);
    } finally { await app.close(); }
  });
}

test('Admin activity and token refresh renew idle time without extending absolute expiry or Customer sessions', async () => {
  const { app, browser, sessions, store, upstream } = await setup();
  try {
    await browser.login('customer');
    const customerId = browser.cookies.get('__Host-nestora-customer')!;
    const customerKey = sessions.key('customer', customerId);
    const customerRecord = await store.get(customerKey);
    await browser.login('admin');
    const adminId = browser.cookies.get('__Host-nestora-admin')!;
    const key = sessions.key('admin', adminId);
    const session = sessions.vault.open<ServerSession>((await store.get(key))!, key);
    session.lastSeenAt = Date.now() - 29 * 60 * 1000;
    session.tokenExpiresAt = Date.now() - 1000;
    await store.set(key, sessions.vault.seal(session, key), 60);
    const response = await browser.request('/api/admin/auth/refresh', 'POST', {});
    assert.equal(response.statusCode, 200);
    const updated = sessions.vault.open<ServerSession>((await store.get(key))!, key);
    assert.equal(updated.absoluteExpiresAt, session.absoluteExpiresAt);
    assert.equal(updated.createdAt, session.createdAt);
    assert.ok(updated.lastSeenAt > session.lastSeenAt);
    assert.ok(store.records.get(key)!.expires - Date.now() > 29 * 60 * 1000);
    assert.equal(upstream.refreshCount, 1);
    assert.equal(await store.get(customerKey), customerRecord);
    assert.equal(browser.cookies.get('__Host-nestora-customer'), customerId);
  } finally { await app.close(); }
});

test('Customer remembered and session-only lifetimes remain unchanged, including legacy records', async () => {
  const { app, browser, sessions, store } = await setup();
  try {
    for (const remember of [false, true]) {
      const response = await browser.login('customer', 'customer@example.com', remember);
      const cookie = response.cookies.find((item) => item.name === '__Host-nestora-customer');
      if (remember) assert.ok(cookie?.maxAge && cookie.maxAge <= 30 * 86400 && cookie.maxAge >= 30 * 86400 - 2);
      else assert.equal(cookie?.maxAge, undefined);
      const id = browser.cookies.get('__Host-nestora-customer')!;
      const key = sessions.key('customer', id);
      const session = sessions.vault.open<ServerSession>((await store.get(key))!, key);
      assert.equal(session.remember, remember);
      assert.equal(session.absoluteExpiresAt - session.createdAt!, (remember ? 30 * 86400 : 8 * 3600) * 1000);
      const idle = (remember ? 7 * 86400 : 3600) * 1000;
      assert.ok(store.records.get(key)!.expires - Date.now() <= idle);
      assert.ok(store.records.get(key)!.expires - Date.now() > idle - 2000);
      delete session.createdAt;
      await store.set(key, sessions.vault.seal(session, key), 600);
      assert.equal((await browser.request('/api/customer/auth/session')).statusCode, 200);
    }
  } finally { await app.close(); }
});

test('server rejects wrong audience, inactive users, forged cookies and privilege mutations', async () => {
  const { app, upstream, browser, store } = await setup();
  try {
    assert.equal((await browser.login('admin', 'customer@example.com')).statusCode, 403);
    assert.equal([...store.records.keys()].filter((key) => key.includes(':session:')).length, 0);
    upstream.inactive.add('admin');
    assert.equal((await browser.login('admin')).statusCode, 403);
    upstream.inactive.clear(); await browser.login('admin');
    const mutate = await browser.request('/api/admin/supabase/rest/v1/profiles?id=eq.admin-id', 'PATCH', { role_id: 'super_admin' });
    assert.equal(mutate.statusCode, 403);
    assert.equal(upstream.requests.filter((r) => r.method === 'PATCH').length, 0);
    const forged = await browser.request('/api/admin/auth/session', 'GET', undefined, { cookie: '__Host-nestora-admin=' + 'A'.repeat(43) });
    assert.equal(forged.statusCode, 401);
  } finally { await app.close(); }
});

test('CSRF/origin checks reject cross-site login, checkout and logout before side effects', async () => {
  const { app, browser, upstream } = await setup();
  try {
    for (const path of ['auth/login', 'auth/logout', 'supabase/rest/v1/rpc/place_customer_order']) {
      const response = await browser.request('/api/customer/' + path, 'POST', {}, { origin: 'https://evil.test' });
      assert.equal(response.statusCode, 403);
      assert.equal(response.json().code, 'CSRF_FAILED');
    }
    assert.equal(upstream.requests.length, 0);
  } finally { await app.close(); }
});

test('authenticated requests and checkout use the correct user JWT server-side; guests stay anonymous', async () => {
  const { app, browser, upstream } = await setup();
  try {
    const guest = await browser.request('/api/customer/supabase/rest/v1/products?select=id');
    assert.equal(guest.statusCode, 200);
    assert.equal(upstream.requests.at(-1)?.authorization, 'Bearer ' + config.supabaseKey);
    const denied = await browser.request('/api/customer/supabase/rest/v1/orders');
    assert.equal(denied.statusCode, 401);
    await browser.login('customer');
    const args = { p_checkout_token: 'idempotency-fixture', p_cart_id: 'cart-fixture', p_items: [{ product_id: 'product-fixture', quantity: 1 }] };
    const order = await browser.request('/api/customer/supabase/rest/v1/rpc/place_customer_order', 'POST', args);
    assert.equal(order.statusCode, 200, order.body);
    assert.deepEqual(JSON.parse(upstream.requests.at(-1)?.body ?? ''), args);
    assert.match(upstream.requests.at(-1)?.authorization ?? '', /^Bearer eyJ/);
    assert.equal(upstream.requests.filter((r) => r.url.includes('/rpc/place_customer_order')).length, 1);
    assert.equal((await browser.request('/api/customer/supabase/rest/v1/rpc/refresh_dashboard_statistics', 'POST', {})).statusCode, 403);
    assert.equal((await browser.request('/api/customer/supabase/auth/v1/token', 'POST', {})).statusCode, 403);
  } finally { await app.close(); }
});

test('public catalogue and Customer resources never depend on an Admin cookie; Admin APIs stay protected', async () => {
  const { app, browser, upstream } = await setup();
  try {
    for (const table of ['products', 'categories', 'promotions']) {
      const response = await browser.request(`/api/customer/supabase/rest/v1/${table}?is_active=eq.true`);
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(upstream.requests.at(-1)?.authorization, 'Bearer ' + config.supabaseKey);
      assert.doesNotMatch(response.body, /access_token|refresh_token|eyJ/);
    }
    await browser.login('customer');
    for (const table of ['carts', 'wishlist', 'orders']) {
      const response = await browser.request(`/api/customer/supabase/rest/v1/${table}`);
      assert.equal(response.statusCode, 200, response.body);
      const bearer = upstream.requests.at(-1)?.authorization?.slice(7) ?? '';
      assert.equal(upstream.tokens.get(bearer), 'customer');
    }
    assert.equal((await browser.request('/api/admin/supabase/rest/v1/categories')).statusCode, 401);
    assert.equal((await browser.request('/api/admin/supabase/rest/v1/rpc/refresh_dashboard_statistics', 'POST', { period: 'ALL' })).statusCode, 401);
    await browser.login('admin');
    browser.cookies.delete('__Host-nestora-customer');
    assert.equal((await browser.request('/api/customer/supabase/rest/v1/categories')).statusCode, 200);
    assert.equal(upstream.requests.at(-1)?.authorization, 'Bearer ' + config.supabaseKey);
    assert.equal((await browser.request('/api/customer/supabase/rest/v1/orders')).statusCode, 401);
    const dashboard = await browser.request('/api/admin/supabase/rest/v1/rpc/refresh_dashboard_statistics', 'POST', { period: 'ALL' });
    assert.equal(dashboard.statusCode, 200, dashboard.body);
    const bearer = upstream.requests.at(-1)?.authorization?.slice(7) ?? '';
    assert.equal(upstream.tokens.get(bearer), 'admin');
    assert.doesNotMatch(dashboard.body, /access_token|refresh_token|eyJ/);
  } finally { await app.close(); }
});

test('refresh is serialized across concurrent requests and never returns credentials', async () => {
  const { app, browser, upstream } = await setup();
  try {
    upstream.tokenLifetime = 30; await browser.login('customer'); upstream.tokenLifetime = 3600;
    const responses = await Promise.all(Array.from({ length: 5 }, () => browser.request('/api/customer/auth/session')));
    assert.equal(upstream.refreshCount, 1);
    for (const response of responses) { assert.equal(response.statusCode, 200, response.body); assert.doesNotMatch(response.body, /access_token|refresh_token|eyJ/); }
  } finally { await app.close(); }
});

test('Admin validation can overlap, and logout wins over checks already in flight', { timeout: 3000 }, async () => {
  const upstream = new Upstream();
  let entered!: () => void;
  let release!: () => void;
  const bothEntered = new Promise<void>((resolve) => { entered = resolve; });
  const waitForRelease = new Promise<void>((resolve) => { release = resolve; });
  let pause = false;
  let validations = 0;
  const app = await createApp(config, new TestStore(), async (input, init) => {
    if (pause && new URL(String(input)).pathname === '/auth/v1/user') {
      if (++validations === 2) entered();
      await waitForRelease;
    }
    return upstream.fetch(input, init);
  });
  const browser = new Browser(app);
  try {
    await browser.initialize();
    assert.equal((await browser.login('admin')).statusCode, 200);
    pause = true;
    const session = browser.request('/api/admin/auth/session');
    const data = browser.request('/api/admin/supabase/rest/v1/products');
    await bothEntered;
    assert.equal((await browser.request('/api/admin/auth/logout', 'POST', {})).statusCode, 200);
    release();
    assert.equal((await session).statusCode, 401);
    assert.equal((await data).statusCode, 401);
    assert.equal(upstream.requests.some(({ url }) => new URL(url).pathname === '/rest/v1/products'), false);
  } finally {
    release();
    await app.close();
  }
});

test('logout invalidates the server record despite upstream failure and cannot be resurrected by refresh', async () => {
  const { app, browser, upstream, sessions, store } = await setup();
  try {
    await browser.login('customer'); upstream.logoutFailure = true;
    const id = browser.cookies.get('__Host-nestora-customer')!;
    const response = await browser.request('/api/customer/auth/logout', 'POST', {});
    assert.equal(response.statusCode, 200); assert.equal(response.json().remoteRevocationConfirmed, false);
    assert.equal(await store.get(sessions.key('customer', id)), null);
    await assert.rejects(() => sessions.resolve('customer', id));
    assert.equal(browser.cookies.has('__Host-nestora-customer'), false);
  } finally { await app.close(); }
});

test('Admin and Customer logout expose sanitized revocation outcomes while rejecting old cookies', async () => {
  for (const audience of ['admin', 'customer'] as const) {
    for (const [status, code, expected, scheduled] of [
      [204, null, 'confirmed', false], [401, 'bad_jwt', 'already_invalid', false],
      [404, null, 'uncertain', false], [503, null, 'uncertain', true],
    ] as const) {
      const { app, browser, upstream } = await setup();
      try {
        await browser.login(audience);
        const cookie = [...browser.cookies].map(([name, value]) => name + '=' + value).join('; ');
        upstream.logoutStatus = status === 204 ? null : status; upstream.logoutCode = code;
        const logout = await browser.request('/api/' + audience + '/auth/logout', 'POST', {});
        assert.equal(logout.statusCode, 200);
        assert.deepEqual(logout.json(), { localSessionCleared: true, remoteRevocationConfirmed: expected === 'confirmed',
          revocationStatus: expected, revocationRetryScheduled: scheduled });
        assert.doesNotMatch(logout.body, /access_token|refresh_token|accessToken|server-only|eyJ/);
        const repeated = await browser.request('/api/' + audience + '/auth/logout', 'POST', {}, { cookie });
        assert.equal(repeated.statusCode, 200);
        assert.equal(repeated.json().revocationStatus, expected);
        assert.equal((await browser.request('/api/' + audience + '/auth/refresh', 'POST', {}, { cookie })).statusCode, 401);
        assert.equal((await browser.request('/api/' + audience + '/auth/session', 'GET', undefined, { cookie })).statusCode, 401);
        assert.equal(upstream.refreshCount, 0);
      } finally { await app.close(); }
    }
  }
});

test('expired/deactivated sessions and shared-store outages fail closed', async () => {
  const { app, browser, upstream, sessions, store } = await setup();
  try {
    await browser.login('customer');
    const id = browser.cookies.get('__Host-nestora-customer')!;
    const key = sessions.key('customer', id);
    const saved = sessions.vault.open<ServerSession>((await store.get(key))!, key);
    saved.absoluteExpiresAt = Date.now() - 1;
    await store.set(key, sessions.vault.seal(saved, key), 600);
    assert.equal((await browser.request('/api/customer/auth/session')).statusCode, 401);
    await browser.login('customer'); upstream.inactive.add('customer');
    assert.equal((await browser.request('/api/customer/supabase/rest/v1/orders')).statusCode, 403);
    store.fail = true;
    assert.equal((await browser.request('/api/customer/auth/session')).statusCode, 503);
  } finally { await app.close(); }
});

test('Google PKCE callback exchanges code on the server, binds the browser flow, and rejects replay', async () => {
  const { app, browser, upstream } = await setup();
  try {
    const start = await browser.request('/api/customer/auth/oauth', 'POST', { remember: false });
    assert.equal(start.statusCode, 200, start.body);
    const url = new URL(start.json().url);
    assert.equal(url.searchParams.get('provider'), 'google');
    assert.ok(url.searchParams.get('code_challenge'));
    assert.doesNotMatch(start.body, /access_token|refresh_token|code_verifier/);
    const callback = await browser.request('/api/customer/auth/callback?code=valid-code');
    assert.equal(callback.statusCode, 303); assert.equal(callback.headers.location, '/auth/customer-callback');
    assert.ok(browser.cookies.get('__Host-nestora-customer'));
    assert.ok(upstream.requests.some((r) => r.url.includes('grant_type=pkce') && r.body.includes('code_verifier')));
    const replay = await browser.request('/api/customer/auth/callback?code=valid-code');
    assert.match(String(replay.headers.location), /error=authentication_failed/);
  } finally { await app.close(); }
});

test('registration confirmation and recovery-only sessions work without granting protected data access', async () => {
  const { app, browser } = await setup();
  try {
    const signup = await browser.request('/api/customer/auth/register', 'POST', { email: 'customer@example.com', password: 'correct', fullName: 'Name', phone: '123' });
    assert.equal(signup.statusCode, 200, signup.body); assert.equal(signup.json().confirmationRequired, true);
    assert.equal(browser.cookies.has('__Host-nestora-customer'), false);
    assert.equal((await browser.request('/api/customer/auth/recovery', 'POST', { email: 'customer@example.com' })).statusCode, 200);
    const callback = await browser.request('/api/customer/auth/callback?code=recovery-code');
    assert.equal(callback.headers.location, '/auth/customer-reset-password');
    const recovered = await browser.request('/api/customer/auth/session');
    assert.equal(recovered.json().recovery, true);
    assert.equal((await browser.request('/api/customer/supabase/rest/v1/orders')).statusCode, 403);
    assert.equal((await browser.request('/api/customer/auth/password', 'POST', { password: 'new-password' })).statusCode, 200);
    assert.equal(browser.cookies.has('__Host-nestora-customer'), false);
  } finally { await app.close(); }
});

test('email recovery works in another browser, while cross-browser signup does not silently create a login', async () => {
  const { app, browser } = await setup();
  try {
    await browser.request('/api/customer/auth/recovery', 'POST', { email: 'customer@example.com' });
    const recoveryFlow = browser.cookies.get('__Host-nestora-customer-flow');
    const other = new Browser(app); await other.initialize();
    const recovery = await other.request('/api/customer/auth/callback?flow=' + recoveryFlow + '&code=recovery-code');
    assert.equal(recovery.headers.location, '/auth/customer-reset-password');
    assert.equal((await other.request('/api/customer/auth/session')).json().recovery, true);
    await browser.request('/api/customer/auth/register', 'POST', { email: 'customer@example.com', password: 'correct', fullName: 'Name', phone: '123' });
    const signupFlow = browser.cookies.get('__Host-nestora-customer-flow');
    const third = new Browser(app); await third.initialize();
    const signup = await third.request('/api/customer/auth/callback?flow=' + signupFlow + '&code=valid-code');
    assert.equal(signup.headers.location, '/auth/customer-login');
    assert.equal(third.cookies.has('__Host-nestora-customer'), false);
  } finally { await app.close(); }
});

test('Customer logout invalidates every pending browser flow, including overwritten flow cookies', async () => {
  const { app, browser, upstream, store } = await setup();
  try {
    await browser.login('admin');
    await browser.login('customer');
    const flows: { id: string; code: string }[] = [];
    for (const kind of ['recovery', 'oauth', 'register'] as const) {
      const body = kind === 'recovery' ? { email: 'customer@example.com' }
        : kind === 'oauth' ? { remember: true }
        : { email: 'customer@example.com', password: 'correct', fullName: 'Name', phone: '123' };
      assert.equal((await browser.request('/api/customer/auth/' + kind, 'POST', body)).statusCode, 200);
      flows.push({ id: browser.cookies.get('__Host-nestora-customer-flow')!, code: kind === 'recovery' ? 'recovery-code' : 'valid-code' });
    }
    assert.equal((await browser.request('/api/customer/auth/logout', 'POST', {})).statusCode, 200);
    for (const flow of flows) {
      assert.equal(await store.get('nestora:flow:customer:' + fingerprint(flow.id)), null);
      // Replay both a copied cookie and the email-link query parameter.
      for (const cookie of ['', '__Host-nestora-customer-flow=' + flow.id]) {
        const replay = await browser.request('/api/customer/auth/callback?flow=' + flow.id + '&code=' + flow.code, 'GET', undefined, { cookie });
        assert.match(String(replay.headers.location), /error=authentication_failed/);
        assert.equal(replay.cookies.some((item) => item.name === '__Host-nestora-customer' && item.value), false);
      }
    }
    assert.equal(upstream.requests.some((item) => item.url.includes('grant_type=pkce')), false);
    assert.equal((await browser.request('/api/admin/auth/session')).statusCode, 200);
  } finally { await app.close(); }
});

test('Admin logout does not cancel Customer recovery, and standalone recovery remains scoped to its browser', async () => {
  const { app, browser } = await setup();
  try {
    await browser.login('admin');
    await browser.request('/api/customer/auth/recovery', 'POST', { email: 'customer@example.com' });
    const flow = browser.cookies.get('__Host-nestora-customer-flow');
    await browser.request('/api/admin/auth/logout', 'POST', {});
    assert.equal(browser.cookies.get('__Host-nestora-customer-flow'), flow);
    const unrelated = new Browser(app); await unrelated.initialize();
    await unrelated.request('/api/customer/auth/logout', 'POST', {});
    const callback = await browser.request('/api/customer/auth/callback?code=recovery-code');
    assert.equal(callback.headers.location, '/auth/customer-reset-password');
    assert.equal((await browser.request('/api/customer/auth/session')).json().recovery, true);
    assert.equal((await browser.request('/api/customer/supabase/rest/v1/orders')).statusCode, 403);
  } finally { await app.close(); }
});

test('a fresh standalone recovery after logout works, but the invalidated link stays unusable', async () => {
  const { app, browser } = await setup();
  try {
    await browser.request('/api/customer/auth/recovery', 'POST', { email: 'customer@example.com' });
    const old = browser.cookies.get('__Host-nestora-customer-flow');
    await browser.request('/api/customer/auth/logout', 'POST', {});
    await browser.request('/api/customer/auth/recovery', 'POST', { email: 'customer@example.com' });
    const fresh = browser.cookies.get('__Host-nestora-customer-flow');
    const replay = await browser.request('/api/customer/auth/callback?flow=' + old + '&code=recovery-code');
    assert.match(String(replay.headers.location), /error=authentication_failed/);
    // A stale callback may clear the flow cookie; the fresh email link remains valid.
    assert.equal((await browser.request('/api/customer/auth/callback?flow=' + fresh + '&code=recovery-code')).headers.location, '/auth/customer-reset-password');
  } finally { await app.close(); }
});

test('logout during code exchange cancels callback session issuance and prevents replay', async () => {
  const { app, browser, upstream, store } = await setup();
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const exchanging = new Promise<void>((resolve) => { started = resolve; });
  upstream.beforeCodeExchange = async () => { started(); await waiting; };
  try {
    await browser.request('/api/customer/auth/recovery', 'POST', { email: 'customer@example.com' });
    const flow = browser.cookies.get('__Host-nestora-customer-flow');
    const callback = browser.request('/api/customer/auth/callback?flow=' + flow + '&code=recovery-code');
    await exchanging;
    const logout = await browser.request('/api/customer/auth/logout', 'POST', {});
    assert.equal(logout.statusCode, 200);
    release();
    const response = await callback;
    assert.match(String(response.headers.location), /error=authentication_failed/);
    assert.equal(response.cookies.some((item) => item.name === '__Host-nestora-customer' && item.value), false);
    assert.equal([...store.records.keys()].filter((key) => key.startsWith('nestora:session:customer:')).length, 0);
    assert.equal((await browser.request('/api/customer/auth/session')).json().session, null);
    const replay = await browser.request('/api/customer/auth/callback?flow=' + flow + '&code=recovery-code');
    assert.match(String(replay.headers.location), /error=authentication_failed/);
  } finally { release(); await app.close(); }
});

test('logout with an older cookie revokes a callback session committed concurrently', async () => {
  const { app, browser } = await setup();
  try {
    await browser.login('customer');
    await browser.request('/api/customer/auth/oauth', 'POST', { remember: true });
    const beforeCallback = [...browser.cookies].map(([name, value]) => name + '=' + value).join('; ');
    assert.equal((await browser.request('/api/customer/auth/callback?code=valid-code')).headers.location, '/auth/customer-callback');
    const issued = browser.cookies.get('__Host-nestora-customer')!;
    // Logout was sent before the callback's Set-Cookie reached this browser.
    assert.equal((await browser.request('/api/customer/auth/logout', 'POST', {}, { cookie: beforeCallback })).statusCode, 200);
    const response = await browser.request('/api/customer/auth/session', 'GET', undefined, { cookie: '__Host-nestora-customer=' + issued });
    assert.equal(response.statusCode, 401);
  } finally { await app.close(); }
});

test('a failed logout can retry cleanup of a callback session using the older request cookie', async () => {
  const { app, browser, store, sessions } = await setup();
  try {
    await browser.request('/api/customer/auth/oauth', 'POST', { remember: true });
    const beforeCallback = [...browser.cookies].map(([name, value]) => name + '=' + value).join('; ');
    await browser.request('/api/customer/auth/callback?code=valid-code');
    const issued = browser.cookies.get('__Host-nestora-customer')!;
    const key = sessions.key('customer', issued);
    const originalDelete = store.delete.bind(store);
    let failOnce = true;
    store.delete = async (target, lease, pending) => {
      if (target === key && failOnce) { failOnce = false; throw new Error('Fixture session deletion failure'); }
      await originalDelete(target, lease, pending);
    };
    assert.equal((await browser.request('/api/customer/auth/logout', 'POST', {}, { cookie: beforeCallback })).statusCode, 503);
    assert.equal((await browser.request('/api/customer/auth/logout', 'POST', {}, { cookie: beforeCallback })).statusCode, 200);
    assert.equal((await browser.request('/api/customer/auth/session', 'GET', undefined, {
      cookie: '__Host-nestora-customer=' + issued,
    })).statusCode, 401);
  } finally { await app.close(); }
});

test('catalogue remains public after session expiry, but checkout never silently downgrades to guest', async () => {
  const { app, browser, store, sessions } = await setup();
  try {
    await browser.login('customer');
    const id = browser.cookies.get('__Host-nestora-customer')!;
    await store.delete(sessions.key('customer', id));
    const checkout = await browser.request('/api/customer/supabase/rest/v1/rpc/place_customer_order', 'POST', { p_cart_id: 'cart-fixture' });
    assert.equal(checkout.statusCode, 401);
    const catalogue = await browser.request('/api/customer/supabase/rest/v1/products');
    assert.equal(catalogue.statusCode, 200);
  } finally { await app.close(); }
});

test('avatar uploads use the user JWT and cannot address another customer or admin bucket', async () => {
  const { app, browser, upstream } = await setup();
  try {
    await browser.login('customer');
    const cookie = [...browser.cookies].map(([key, value]) => key + '=' + value).join('; ');
    const upload = (path: string) => app.inject({ method: 'POST', url: '/api/customer/supabase/storage/v1/object/' + path,
      headers: { cookie, origin: config.origin, 'x-csrf-token': browser.csrf, 'content-type': 'image/png' }, payload: Buffer.from('fixture-image') });
    assert.equal((await upload('avatars/customer-id/avatar.png')).statusCode, 200);
    assert.match(upstream.requests.at(-1)?.authorization ?? '', /^Bearer eyJ/);
    assert.equal((await upload('avatars/victim/avatar.png')).statusCode, 403);
    assert.equal((await upload('media-library/file.png')).statusCode, 403);
  } finally { await app.close(); }
});

test('password change verifies the current password without rotating the BFF cookie or permitting recovery bypass', async () => {
  const { app, browser } = await setup();
  try {
    await browser.login('customer');
    const id = browser.cookies.get('__Host-nestora-customer');
    assert.equal((await browser.request('/api/customer/auth/password', 'POST', { password: 'new-password' })).statusCode, 403);
    const denied = await browser.request('/api/customer/auth/password/change', 'POST', { currentPassword: 'wrong', newPassword: 'new-password' });
    assert.equal(denied.statusCode, 400);
    const changed = await browser.request('/api/customer/auth/password/change', 'POST', { currentPassword: 'correct', newPassword: 'new-password' });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal(browser.cookies.get('__Host-nestora-customer'), id);
    assert.equal((await browser.request('/api/customer/auth/session')).statusCode, 200);
    assert.doesNotMatch(changed.body, /access_token|refresh_token|eyJ/);
  } finally { await app.close(); }
});

test('server blocks credential-bearing upstream JSON, unknown schemas, and private Realtime ownership changes', async () => {
  const { app, browser, upstream } = await setup();
  try {
    await browser.login('customer');
    upstream.unsafeResponse = { nested: { refresh_token: 'should-never-reach-browser' } };
    const unsafe = await browser.request('/api/customer/supabase/rest/v1/rpc/get_my_loyalty_balance', 'POST', {});
    assert.equal(unsafe.statusCode, 502); assert.doesNotMatch(unsafe.body, /should-never/);
    assert.equal((await browser.request('/api/customer/supabase/rest/v1/orders', 'GET', undefined, { 'accept-profile': 'auth' })).statusCode, 403);
    const subscription = await browser.request('/api/customer/realtime', 'POST', { changes: [{ schema: 'public', table: 'customer_loyalty_points_ledger', event: 'INSERT', filter: 'user_id=eq.victim' }] });
    assert.equal(subscription.statusCode, 200, subscription.body);
    assert.doesNotMatch(subscription.body, /access_token|refresh_token|eyJ|victim/);
    assert.equal((await browser.request('/api/customer/realtime', 'POST', { changes: [{ schema: 'public', table: 'profiles', event: '*' }] })).statusCode, 403);
  } finally { await app.close(); }
});

test('auth rate limit is shared and a disabled BFF never falls back to direct authentication', async () => {
  const { app, browser } = await setup();
  try {
    for (let i = 0; i < 20; i++) await browser.request('/api/customer/auth/login', 'POST', { email: 'customer@example.com', password: 'wrong' });
    assert.equal((await browser.login('customer')).statusCode, 429);
  } finally { await app.close(); }
  const disabled = await createApp({ ...config, enabled: false }, new TestStore(), new Upstream().fetch);
  try { assert.equal((await disabled.inject('/api/customer/auth/session')).statusCode, 503); }
  finally { await disabled.close(); }
});
