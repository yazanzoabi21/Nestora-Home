import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ADMIN_SUPABASE, CUSTOMER_SUPABASE, PUBLIC_SUPABASE, AuthPersistenceStorage } from '../../tokens';
import { AdminAuthService } from './admin-auth.service';
import { CustomerAuthService } from './customer-auth.service';

describe('direct Supabase SDK integration', () => {
  const requests: { url: URL; method: string; authorization: string | null }[] = [];
  let clients: SupabaseClient[];
  let sequence: number;
  let refreshes: number;
  let failReads: boolean;
  let denyMutations: boolean;
  const identities = new Map<string, string>();

  function user(name: string) {
    return { id: name + '-user', aud: 'authenticated', role: 'authenticated', email: name + '@example.com',
      app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01' };
  }
  function issue(name: string) {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const access_token = btoa(JSON.stringify({ alg: 'HS256' })) + '.' +
      btoa(JSON.stringify({ sub: name + '-user', exp, jti: ++sequence })) + '.fixture';
    identities.set(access_token, name);
    return { access_token, refresh_token: name + '-refresh', token_type: 'bearer', expires_in: 3600,
      expires_at: exp, user: user(name) };
  }

  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear(); identities.clear(); requests.length = 0;
    sequence = 0; refreshes = 0; failReads = false; denyMutations = false;
    vi.stubGlobal('BroadcastChannel', undefined);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const headers = new Headers(init?.headers);
      const authorization = headers.get('authorization');
      const name = identities.get(authorization?.replace(/^Bearer /, '') ?? '');
      requests.push({ url, method: init?.method ?? 'GET', authorization });
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
      const respond = (data: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), {
        status, headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
      });
      if (url.pathname === '/auth/v1/token') {
        if (url.searchParams.get('grant_type') === 'refresh_token') {
          refreshes++; return respond(issue(String(body['refresh_token']).split('-')[0]));
        }
        if (body['password'] !== 'correct') return respond({ code: 'invalid_credentials', message: 'Invalid credentials' }, 400);
        return respond(issue(String(body['email']).split('@')[0]));
      }
      if (url.pathname === '/auth/v1/logout') return respond(null, 204);
      if (url.pathname === '/auth/v1/user') return respond(user(name ?? 'customer'));
      if (denyMutations && url.pathname.startsWith('/rest/') && init?.method !== 'GET') {
        return respond({ code: '42501', message: 'Row-level security denied this operation' }, 403);
      }
      if (url.pathname === '/rest/v1/profiles') return failReads ? respond({}, 503) : respond([{
        id: (name ?? 'customer') + '-user', is_active: true, roles: { id: 'role', name: name ?? 'customer' },
      }]);
      return respond([]);
    }));
    TestBed.configureTestingModule({ providers: [
      { provide: Router, useValue: { url: '/', navigate: vi.fn().mockResolvedValue(true), navigateByUrl: vi.fn().mockResolvedValue(true) } },
    ] });
    clients = [TestBed.inject(ADMIN_SUPABASE), TestBed.inject(CUSTOMER_SUPABASE), TestBed.inject(PUBLIC_SUPABASE)];
  });
  afterEach(async () => {
    for (const client of clients) { await client.auth.stopAutoRefresh(); await client.removeAllChannels(); }
    TestBed.resetTestingModule(); vi.unstubAllGlobals();
  });

  it('uses direct auth and database requests while preserving independent audience login/logout', async () => {
    const admin = TestBed.inject(AdminAuthService);
    const customer = TestBed.inject(CustomerAuthService); await customer.initialize();
    await admin.login({ email: 'admin@example.com', password: 'correct' });
    await customer.login({ email: 'customer@example.com', password: 'correct' }, null, false);
    expect(admin.currentUserProfile()?.roles?.name).toBe('admin');
    expect(customer.isAuthenticated()).toBe(true);
    expect(localStorage.getItem('nestora-admin-auth')).not.toBeNull();
    expect(sessionStorage.getItem('nestora-customer-auth')).not.toBeNull();
    const restored = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: { storageKey: 'nestora-customer-auth', storage: new AuthPersistenceStorage('nestora-customer-auth'),
        persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    });
    clients.push(restored);
    expect((await restored.auth.getSession()).data.session?.user.id).toBe('customer-user');
    await admin.logout();
    expect((await clients[0].auth.getSession()).data.session).toBeNull();
    expect((await clients[1].auth.getSession()).data.session?.user.id).toBe('customer-user');
    expect(requests.every(({ url }) => url.origin === environment.supabaseUrl)).toBe(true);
    expect(requests.some(({ url }) => url.pathname === '/auth/v1/token')).toBe(true);
  });

  it('preserves an established SDK session after invalid credentials and temporary profile errors', async () => {
    const admin = TestBed.inject(AdminAuthService);
    await admin.login({ email: 'admin@example.com', password: 'correct' });
    const before = localStorage.getItem('nestora-admin-auth');
    await expect(admin.login({ email: 'admin@example.com', password: 'wrong' })).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(localStorage.getItem('nestora-admin-auth')).toBe(before);
    expect(requests.some(({ url }) => url.pathname.endsWith('/logout'))).toBe(false);
    failReads = true;
    await expect(admin.getCurrentUserProfile()).rejects.toThrow();
    expect(admin.currentUserProfile()?.id).toBe('admin-user');
    expect((await clients[0].auth.getSession()).data.session?.user.id).toBe('admin-user');
  });

  it('refreshes expired persisted credentials automatically on restoration', async () => {
    const session = { ...issue('customer'), expires_at: Math.floor(Date.now() / 1000) - 1 };
    const storage = new AuthPersistenceStorage('refresh-restoration');
    storage.setItem('refresh-restoration', JSON.stringify(session));
    const restored = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: { storageKey: 'refresh-restoration', storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    clients.push(restored);
    expect((await restored.auth.getSession()).data.session?.user.id).toBe('customer-user');
    expect(refreshes).toBe(1);
    expect((await restored.auth.getSession()).data.session?.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('keeps public reads anonymous and exposes native Storage and Realtime without a session', async () => {
    await clients[0].auth.signInWithPassword({ email: 'admin@example.com', password: 'correct' });
    for (const table of ['products', 'categories', 'promotions', 'discounts', 'customer_offers']) {
      expect((await clients[2].from(table).select('id')).error).toBeNull();
    }
    expect(requests.filter(({ url }) => url.pathname.startsWith('/rest/'))
      .every(({ authorization }) => authorization === 'Bearer ' + environment.supabaseAnonKey)).toBe(true);
    expect((await clients[2].auth.getSession()).data.session).toBeNull();
    expect(clients[1].storage.from('avatars').getPublicUrl('public.png').data.publicUrl)
      .toContain('/storage/v1/object/public/avatars/public.png');
    const channel = clients[1].channel('direct-native-check');
    expect(typeof channel.subscribe).toBe('function');
    await clients[1].removeChannel(channel);
  });

  it('sends Admin CRUD, Customer checkout and Storage uploads with their own SDK credentials', async () => {
    await clients[0].auth.signInWithPassword({ email: 'admin@example.com', password: 'correct' });
    await clients[1].auth.signInWithPassword({ email: 'customer@example.com', password: 'correct' });
    expect((await clients[0].from('categories').insert({ name: 'Test-only category' })).error).toBeNull();
    expect((await clients[0].from('categories').update({ name: 'Updated test-only category' }).eq('id', 'fixture')).error).toBeNull();
    expect((await clients[0].from('categories').delete().eq('id', 'fixture')).error).toBeNull();
    expect((await clients[1].rpc('place_customer_order', { p_cart_id: 'test-only-cart' })).error).toBeNull();
    expect((await clients[1].storage.from('avatars').upload('customer-user/avatar.png',
      new Blob(['test-image'], { type: 'image/png' }))).error).toBeNull();
    const adminWrites = requests.filter(({ url }) => url.pathname === '/rest/v1/categories');
    expect(adminWrites.map(({ method }) => method)).toEqual(['POST', 'PATCH', 'DELETE']);
    expect(adminWrites.every(({ authorization }) => identities.get(authorization?.slice(7) ?? '') === 'admin')).toBe(true);
    const customerWrites = requests.filter(({ url }) => url.pathname.includes('/rpc/place_customer_order') || url.pathname.startsWith('/storage/'));
    expect(customerWrites).toHaveLength(2);
    expect(customerWrites.every(({ authorization }) => identities.get(authorization?.slice(7) ?? '') === 'customer')).toBe(true);
  });

  it('propagates a database policy denial without anonymous fallback or session destruction', async () => {
    await clients[0].auth.signInWithPassword({ email: 'admin@example.com', password: 'correct' });
    denyMutations = true;
    const result = await clients[0].from('products').insert({ name: 'Test-only denied operation' });
    expect(result.status).toBe(403);
    expect(result.error?.code).toBe('42501');
    expect(requests.filter(({ url }) => url.pathname === '/rest/v1/products')).toHaveLength(1);
    expect((await clients[0].auth.getSession()).data.session?.user.id).toBe('admin-user');
    expect(requests.some(({ url }) => url.pathname.endsWith('/logout'))).toBe(false);
  });
});
