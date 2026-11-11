import type { BffConfig } from '../src/config.js';
import type { SharedStore, Lease, PendingWrite } from '../src/store.js';
import { HttpError, opaqueId } from '../src/security.js';

/** Test fixture only. The application entry point always requires RedisStore. */
export class TestStore implements SharedStore {
  readonly records = new Map<string, { value: string; expires: number }>();
  private readonly leases = new Map<string, string>();
  private readonly queues = new Map<string, Promise<unknown>>();
  fail = false;
  async get(key: string): Promise<string | null> {
    if (this.fail) throw new Error('Test store outage');
    const record = this.records.get(key);
    if (!record || record.expires <= Date.now()) { this.records.delete(key); return null; }
    return record.value;
  }
  async set(key: string, value: string, seconds: number, lease?: Lease): Promise<void> {
    this.check(lease);
    this.records.set(key, { value, expires: Date.now() + seconds * 1000 });
  }
  async delete(key: string, lease?: Lease, pending?: PendingWrite): Promise<void> {
    this.check(lease);
    if (pending && !this.records.has(pending.key)) {
      this.records.set(pending.key, { value: pending.value, expires: Date.now() + pending.seconds * 1000 });
    }
    this.records.delete(key);
  }
  async scanRevocations(cursor: string): Promise<{ cursor: string; keys: string[] }> {
    if (this.fail) throw new Error('Test store outage');
    const keys = [...this.records.keys()].filter((key) => key.startsWith('nestora:revocation:'));
    const offset = Number(cursor);
    return { cursor: offset + 100 < keys.length ? String(offset + 100) : '0', keys: keys.slice(offset, offset + 100) };
  }
  async tryLease(key: string): Promise<Lease | null> {
    if (this.fail) throw new Error('Test store outage');
    const lease = { key: key + ':lock', token: opaqueId() };
    if (this.leases.has(lease.key)) return null;
    this.leases.set(lease.key, lease.token);
    return lease;
  }
  async releaseLease(lease: Lease): Promise<void> {
    if (this.leases.get(lease.key) === lease.token) this.leases.delete(lease.key);
  }
  async take(key: string): Promise<string | null> { const value = await this.get(key); await this.delete(key); return value; }
  async count(key: string, seconds: number): Promise<number> {
    const count = Number(await this.get(key) ?? 0) + 1;
    const remaining = this.records.get(key)?.expires;
    await this.set(key, String(count), remaining ? Math.max(1, (remaining - Date.now()) / 1000) : seconds);
    return count;
  }
  async lock<T>(key: string, work: (lease: Lease) => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const lease = { key: key + ':lock', token: opaqueId() };
      this.leases.set(lease.key, lease.token);
      try { return await work(lease); } finally { this.leases.delete(lease.key); }
    });
    this.queues.set(key, next);
    return next;
  }
  private check(lease?: Lease): void {
    if (this.fail || (lease && this.leases.get(lease.key) !== lease.token)) throw new HttpError(503, 'SESSION_LOCK_LOST');
  }
  async ping(): Promise<void> { if (this.fail) throw new Error('Test store outage'); }
  async close(): Promise<void> { /* Test fixture has no network connection. */ }
}

export const config: BffConfig = {
  enabled: true, production: false, origin: 'https://nestora.test',
  supabaseUrl: 'https://project.supabase.test', supabaseKey: 'sb_publishable_test_only',
  redisUrl: 'redis://127.0.0.1:6379', encryptionKey: Buffer.alloc(32, 7).toString('base64'), port: 0,
  sessionSeconds: 8 * 3600, rememberedSeconds: 30 * 86400, idleSeconds: 3600, bodyLimit: 1024 * 1024,
};

export class Upstream {
  readonly requests: { url: string; method: string; authorization: string | null; body: string }[] = [];
  readonly tokens = new Map<string, string>();
  readonly refreshTokens = new Map<string, string>();
  readonly inactive = new Set<string>();
  roleOverride: string | null = null;
  readonly roleOverrides = new Map<string, string>();
  refreshCount = 0;
  tokenLifetime = 3600;
  logoutFailure = false;
  logoutStatus: number | null = null;
  logoutCode: string | null = null;
  logoutNetworkFailure = false;
  beforeLogout?: () => Promise<void>;
  beforeCodeExchange?: () => Promise<void>;
  unsafeResponse: unknown = null;
  private sequence = 0;

  user(name: string) {
    return { id: name + '-id', aud: 'authenticated', role: 'authenticated', email: name + '@example.com',
      app_metadata: { provider: 'email' }, user_metadata: { full_name: name }, created_at: '2026-01-01' };
  }
  issue(name: string) {
    const exp = Math.floor(Date.now() / 1000) + this.tokenLifetime;
    const access_token = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url') + '.' +
      Buffer.from(JSON.stringify({ sub: name + '-id', exp, jti: ++this.sequence })).toString('base64url') + '.testSignature';
    const refresh_token = 'server-only-refresh-' + this.sequence;
    this.tokens.set(access_token, name); this.refreshTokens.set(refresh_token, name);
    return { access_token, refresh_token, token_type: 'bearer' as const, expires_at: exp, expires_in: this.tokenLifetime, user: this.user(name) };
  }
  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init?.headers);
    const authorization = headers.get('authorization');
    const body = typeof init?.body === 'string' ? init.body : Buffer.isBuffer(init?.body) ? init.body.toString() : '';
    this.requests.push({ url: url.toString(), method: init?.method ?? 'GET', authorization, body });
    const data = body && headers.get('content-type')?.includes('json') ? JSON.parse(body) as Record<string, unknown> : {};
    const name = authorization?.startsWith('Bearer ') ? this.tokens.get(authorization.slice(7)) : undefined;
    const response = (value: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(value), {
      status, headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
    });
    if (url.pathname === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'refresh_token') {
        this.refreshCount++;
        const account = this.refreshTokens.get(String(data['refresh_token']));
        this.refreshTokens.delete(String(data['refresh_token']));
        return account ? response(this.issue(account)) : response({ code: 'refresh_token_not_found', message: 'Invalid refresh' }, 400);
      }
      if (grant === 'pkce') {
        await this.beforeCodeExchange?.();
        return data['code_verifier'] && ['valid-code', 'recovery-code'].includes(String(data['auth_code']))
          ? response(this.issue('customer')) : response({ message: 'Invalid code' }, 400);
      }
      if (data['password'] !== 'correct') return response({ code: 'invalid_credentials', message: 'Invalid credentials' }, 400);
      return response(this.issue(String(data['email']).split('@')[0] ?? 'customer'));
    }
    if (url.pathname === '/auth/v1/user') return name ? response(this.user(name)) : response({ message: 'Unauthorized' }, 401);
    if (url.pathname === '/auth/v1/logout') {
      await this.beforeLogout?.();
      if (this.logoutNetworkFailure) throw new Error('Fixture network failure');
      return this.logoutFailure ? response({ message: 'Unavailable' }, 500)
        : this.logoutStatus ? response({ code: this.logoutCode, message: 'Fixture error' }, this.logoutStatus) : response(null, 204);
    }
    if (url.pathname === '/auth/v1/signup') return response({ user: this.user('customer'), session: null });
    if (url.pathname === '/auth/v1/recover') return response({});
    if (url.pathname === '/rest/v1/profiles') {
      if (!name) return response([], 200);
      return response([{ id: name + '-id', role_id: name + '-role', full_name: name, email: name + '@example.com',
        phone: null, avatar_url: null, created_at: '2026-01-01', birthday: null,
        is_active: !this.inactive.has(name), roles: { id: name + '-role', name: this.roleOverrides.get(name) ?? this.roleOverride ?? name } }]);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return response(this.unsafeResponse ?? [{ order_id: 'order-fixture', total: 42 }]);
    if (url.pathname.startsWith('/rest/v1/')) return response([{ id: 'fixture-row' }]);
    return response({ id: 'fixture-object' });
  };
}
