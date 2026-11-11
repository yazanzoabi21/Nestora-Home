import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';
import { AuthPersistenceStorage } from '../../tokens/supabase.tokens';
import { AuthSessionLifecycle } from './auth-session-lifecycle';
import { BffRequestError } from '../bff/bff-api';

const key = 'phase2-sdk-integration-auth';
const session = {
  access_token: 'test-access-token', refresh_token: 'test-refresh-token',
  token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'test-user', aud: 'authenticated', role: 'authenticated',
    email: 'test@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' },
};

describe('audience cleanup with installed Supabase SDK (offline HTTP integration)', () => {
  let client: SupabaseClient;
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(async () => { await client?.auth.stopAutoRefresh(); vi.restoreAllMocks(); });

  function setup(failLogout: boolean, refresh?: () => Promise<Response>): { lifecycle: AuthSessionLifecycle; storage: AuthPersistenceStorage } {
    const storage = new AuthPersistenceStorage(key);
    client = createClient('https://example.supabase.co', 'test-anon-key', {
      auth: { storageKey: key, storage, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('grant_type=refresh_token') && refresh) return refresh();
        if (String(input).includes('/logout')) {
          return new Response(failLogout ? JSON.stringify({ message: 'Unavailable server' }) : null,
            { status: failLogout ? 500 : 204, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify(session), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }) },
    });
    return { lifecycle: new AuthSessionLifecycle(client, storage), storage };
  }

  for (const failLogout of [false, true]) {
    it(`clears SDK and both stores when remote logout failure = ${failLogout}`, async () => {
      const { lifecycle, storage } = setup(failLogout);
      const result = await client.auth.signInWithPassword({ email: 'test@example.com', password: 'secret' });
      expect(result.error).toBeNull();
      expect((await client.auth.getSession()).data.session).not.toBeNull();
      localStorage.setItem('nestora-customer-auth', 'independent-session');
      localStorage.setItem('guest-cart', 'preserved-cart');
      for (const suffix of ['-user', '-code-verifier']) {
        localStorage.setItem(key + suffix, 'old'); sessionStorage.setItem(key + suffix, 'old');
      }
      await expect(lifecycle.logout(vi.fn())).resolves.toEqual({
        localSessionCleared: true, remoteRevocationConfirmed: !failLogout,
      });
      expect((await client.auth.getSession()).data.session).toBeNull();
      for (const suffix of ['', '-user', '-code-verifier']) {
        expect(localStorage.getItem(key + suffix)).toBeNull();
        expect(sessionStorage.getItem(key + suffix)).toBeNull();
      }
      storage.setItem(key, JSON.stringify(session));
      expect((await client.auth.getSession()).data.session).toBeNull();
      expect(localStorage.getItem('nestora-customer-auth')).toBe('independent-session');
      expect(localStorage.getItem('guest-cart')).toBe('preserved-cart');
      await lifecycle.authenticate(false, async () => {
        const login = await client.auth.signInWithPassword({ email: 'test@example.com', password: 'secret' });
        expect(login.error).toBeNull();
      }, vi.fn());
      expect((await client.auth.getSession()).data.session).not.toBeNull();
      expect(sessionStorage.getItem(key)).not.toBeNull();
      expect(localStorage.getItem(key)).toBeNull();
    });
  }

  it('clears a token refresh that was already in flight when logout began', async () => {
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const { lifecycle } = setup(false, () => { entered(); return pending; });
    await client.auth.signInWithPassword({ email: 'test@example.com', password: 'secret' });
    const refreshing = client.auth.refreshSession();
    await started;
    const logout = lifecycle.logout(vi.fn());
    release(new Response(JSON.stringify(session), { status: 200,
      headers: { 'Content-Type': 'application/json' } }));
    await refreshing;
    await logout;
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(lifecycle.acceptsSession).toBe(false);
  });

  it('shares explicit concurrent logout operations before they enter the lifecycle queue', async () => {
    const { lifecycle } = setup(false);
    await client.auth.signInWithPassword({ email: 'test@example.com', password: 'secret' });
    const first = lifecycle.logout(vi.fn());
    const second = lifecycle.logout(vi.fn());
    expect(second).toBe(first);
    await first;
  });

  for (const failure of [new TypeError('Offline'), new BffRequestError(503, 'AUTH_UNAVAILABLE')]) {
    it('preserves the SDK session and storage after a temporary login failure: ' + failure.name, async () => {
      const { lifecycle, storage } = setup(false);
      await client.auth.signInWithPassword({ email: 'test@example.com', password: 'secret' });
      const persisted = storage.getItem(key);
      const clearState = vi.fn();
      await expect(lifecycle.authenticate(false, async () => { throw failure; }, clearState)).rejects.toBe(failure);
      expect(clearState).not.toHaveBeenCalled();
      expect(storage.getItem(key)).toBe(persisted);
      expect((await client.auth.getSession()).data.session?.user.id).toBe(session.user.id);
      expect(lifecycle.acceptsSession).toBe(true);
    });
  }

  it('does not log out the other audience SDK client', async () => {
    const { lifecycle } = setup(false);
    const other = createClient('https://example.supabase.co', 'test-anon-key', {
      auth: { storageKey: 'other-audience', storage: new AuthPersistenceStorage('other-audience'),
        autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async () => new Response(JSON.stringify(session), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }) },
    });
    try {
      await client.auth.signInWithPassword({ email: 'test@example.com', password: 'secret' });
      await other.auth.signInWithPassword({ email: 'test@example.com', password: 'secret' });
      await lifecycle.logout(vi.fn());
      expect((await client.auth.getSession()).data.session).toBeNull();
      expect((await other.auth.getSession()).data.session).not.toBeNull();
    } finally {
      await other.auth.stopAutoRefresh();
    }
  });

  it('invalidates a login already waiting for authorization before logout', async () => {
    const { lifecycle } = setup(false);
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const login = lifecycle.authenticate(true, async (assertCurrent) => {
      entered(); await waiting; assertCurrent();
    }, vi.fn());
    const rejected = expect(login).rejects.toThrow('cancelled');
    await started;
    const logout = lifecycle.logout(vi.fn());
    release();
    await rejected; await logout;
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(lifecycle.acceptsSession).toBe(false);
  });
});
