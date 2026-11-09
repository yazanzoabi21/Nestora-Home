import { vi } from 'vitest';
import { AuthPersistenceStorage } from '../../tokens/supabase.tokens';
import { createBffSupabaseClient, GUEST_OFFERS_HEADER } from './bff-supabase-client';
import type { NestoraSupabaseClient } from '../../models/auth/browser-auth.models';

const user = { id: 'customer-id', email: 'customer@example.com',
  user_metadata: { full_name: 'Customer' }, app_metadata: { provider: 'email' } };
const csrf = 'C'.repeat(43);

describe('token-free BFF browser transport', () => {
  let client: NestoraSupabaseClient;
  let fetcher: ReturnType<typeof vi.fn>;
  let authenticated: boolean;
  let recovery: boolean;
  let offline: boolean;
  let logoutFailed: boolean;

  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    authenticated = false; recovery = false; offline = false; logoutFailed = false;
    vi.stubGlobal('BroadcastChannel', class {
      addEventListener(): void { /* Cross-tab transport is not opened by this fixture. */ }
      postMessage(): void { /* No real browser tabs in the unit test. */ }
    });
    fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (offline) throw new TypeError('Offline');
      const path = String(input);
      const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
        status, headers: { 'Content-Type': 'application/json' },
      });
      if (path === '/api/csrf') return response({ csrfToken: csrf });
      if (path.endsWith('/auth/login')) authenticated = true;
      if (path.endsWith('/auth/logout')) {
        if (logoutFailed) return response({ code: 'SERVICE_UNAVAILABLE' }, 503);
        authenticated = false;
        return response({ localSessionCleared: true, remoteRevocationConfirmed: true });
      }
      if (path.endsWith('/auth/register')) return response({ confirmationRequired: true, user: null, session: null });
      if (path.includes('/auth/')) return response({ user: authenticated ? user : null,
        session: authenticated ? { user } : null, recovery });
      if (path.includes('/profiles')) return response([{ id: user.id, is_active: true }]);
      if (path.includes('/rpc/')) return response([{ order_id: 'order-fixture' }]);
      if (init?.method === 'POST') return response({ path: 'fixture-object' });
      return response([]);
    });
    vi.stubGlobal('fetch', fetcher);
    const storage = new AuthPersistenceStorage('nestora-customer-auth');
    storage.setRememberSession(false);
    client = createBffSupabaseClient('customer', 'https://project.supabase.test', 'sb_publishable_test', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('restores a clean guest as a null session and loads public data without logging in', async () => {
    const session = await client.auth.getSession();
    expect(session).toEqual({ data: { session: null }, error: null });
    expect((await client.auth.getUser()).data.user).toBeNull();
    for (const table of ['products', 'categories', 'promotions', 'discounts']) {
      expect((await client.from(table).select('id')).error).toBeNull();
    }
    expect(fetcher.mock.calls.some(([path]) => String(path).endsWith('/auth/login'))).toBe(false);
    expect(fetcher.mock.calls.every(([path]) => String(path).startsWith('/api/customer/'))).toBe(true);
  });

  it('logs in through /api with CSRF and exposes only a token-free user session', async () => {
    const result = await client.auth.signInWithPassword({ email: 'customer@example.com', password: 'secret' });
    expect(result.error).toBeNull();
    expect(Object.keys(result.data.session ?? {})).toEqual(['user']);
    const login = fetcher.mock.calls.find(([path]) => String(path).endsWith('/auth/login'));
    expect(login).toBeDefined();
    const options = login?.[1] as RequestInit;
    expect(new Headers(options.headers).get('x-csrf-token')).toBe(csrf);
    expect(options.credentials).toBe('same-origin');
    expect(JSON.parse(String(options.body)).remember).toBe(false);
    expect(localStorage.getItem('nestora-customer-auth')).toBeNull();
    expect(sessionStorage.getItem('nestora-customer-auth')).toBeNull();
    expect(fetcher.mock.calls.every(([path]) => String(path).startsWith('/api/'))).toBe(true);
  });

  it('omits cookies only for the explicit public guest offers read', async () => {
    await client.from('customer_offers').select('id').setHeader(GUEST_OFFERS_HEADER, 'true');
    await client.from('customer_offers').select('id');
    await client.from('orders').select('id').setHeader(GUEST_OFFERS_HEADER, 'true');
    const requests = fetcher.mock.calls.map(([, options]) => options as RequestInit);
    expect(requests.map(({ credentials }) => credentials)).toEqual(['omit', 'same-origin', 'same-origin']);
    expect(requests.every(({ headers }) => !new Headers(headers).has(GUEST_OFFERS_HEADER))).toBe(true);
  });

  it('forwards SDK query and checkout builders through BFF without browser Authorization or apikey', async () => {
    await client.auth.signInWithPassword({ email: 'customer@example.com', password: 'secret' });
    const profile = await client.from('profiles').select('id,is_active').eq('id', user.id).maybeSingle();
    expect(profile.error).toBeNull();
    const args = { p_checkout_token: 'idempotency-fixture', p_cart_id: 'cart-fixture', p_items: [{ product_id: 'product-fixture', quantity: 1 }] };
    const order = await client.rpc('place_customer_order', args);
    expect(order.error).toBeNull();
    const request = fetcher.mock.calls.find(([path]) => String(path).includes('/rpc/place_customer_order'));
    const init = request?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual(args);
    expect(new Headers(init.headers).has('authorization')).toBe(false);
    expect(new Headers(init.headers).has('apikey')).toBe(false);
    expect(fetcher.mock.calls.filter(([path]) => String(path).includes('place_customer_order'))).toHaveLength(1);
  });

  it('keeps SDK uploads behind BFF and public media URLs anonymous', async () => {
    const upload = await client.storage.from('avatars').upload('customer-id/avatar.png', new Blob(['image'], { type: 'image/png' }));
    expect(upload.error).toBeNull();
    expect(fetcher.mock.calls.some(([path]) => String(path).includes('/api/customer/supabase/storage/v1/object/avatars/'))).toBe(true);
    const publicUrl = client.storage.from('avatars').getPublicUrl('customer-id/avatar.png').data.publicUrl;
    expect(publicUrl).toBe('https://project.supabase.test/storage/v1/object/public/avatars/customer-id/avatar.png');
    expect(publicUrl).not.toMatch(/token=/);
  });

  it('does not repeatedly emit auth changes for ordinary session reads', async () => {
    await client.auth.signInWithPassword({ email: 'customer@example.com', password: 'secret' });
    const callback = vi.fn(); client.auth.onAuthStateChange(callback);
    await client.auth.getSession(); await client.auth.getUser();
    expect(callback).not.toHaveBeenCalled();
    recovery = true;
    await client.auth.getSession();
    expect(callback).toHaveBeenCalledWith('PASSWORD_RECOVERY', { user });
  });

  it('supports confirmation-required signup without fabricating user IDs or tokens', async () => {
    const result = await client.auth.signUp({ email: 'customer@example.com', password: 'secret',
      options: { data: { full_name: 'Name', phone: '123' } } });
    expect(result.data).toEqual({ confirmationRequired: true, user: null, session: null });
  });

  it('blocks data requests and session restoration until a failed logout reaches the backend', async () => {
    await client.auth.signInWithPassword({ email: 'customer@example.com', password: 'secret' });
    logoutFailed = true;
    expect((await client.auth.signOut()).error).not.toBeNull();
    expect(localStorage.getItem('nestora-customer-bff-logout-pending')).toBe('true');
    expect((await client.from('orders').select('id')).error).not.toBeNull();
    expect((await client.auth.getSession()).data.session).toBeNull();
    logoutFailed = false;
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(localStorage.getItem('nestora-customer-bff-logout-pending')).toBeNull();
  });

  it('fails closed when /api is unavailable instead of trying Supabase login', async () => {
    offline = true;
    const result = await client.auth.signInWithPassword({ email: 'customer@example.com', password: 'secret' });
    expect(result.error).not.toBeNull();
    expect(fetcher.mock.calls.every(([path]) => String(path).startsWith('/api/'))).toBe(true);
  });

  it('does not restore a delayed session read after logout', async () => {
    await client.auth.signInWithPassword({ email: 'customer@example.com', password: 'secret' });
    let release!: (response: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    const read = client.auth.getSession();
    await vi.waitFor(() => expect(release).toBeDefined());
    await client.auth.signOut();
    release(new Response(JSON.stringify({ user, session: { user }, recovery: false }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    expect((await read).data.session).toBeNull();
  });

  it('routes password changes to a single server transaction without browser reauthentication', async () => {
    await client.auth.changePassword?.('current-secret', 'new-secret');
    expect(fetcher.mock.calls.some(([path]) => String(path).endsWith('/auth/password/change'))).toBe(true);
    expect(fetcher.mock.calls.some(([path]) => String(path).endsWith('/auth/login'))).toBe(false);
  });

  it('recognizes a new server session after another tab signs in', async () => {
    await client.auth.getSession();
    const callback = vi.fn(); client.auth.onAuthStateChange(callback);
    authenticated = true;
    await client.auth.getSession();
    expect(callback).toHaveBeenCalledWith('SIGNED_IN', { user });
    expect(client.auth.serverManaged).toBe(true);
  });

  it('shares concurrent session/getUser reads but performs a fresh read after settlement', async () => {
    await Promise.all([client.auth.getSession(), client.auth.getSession(), client.auth.getUser()]);
    expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith('/auth/session'))).toHaveLength(1);
    await client.auth.getSession();
    expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith('/auth/session'))).toHaveLength(2);
  });

  it('retries a failed shared session read without retaining its rejected result', async () => {
    offline = true;
    const results = await Promise.all([client.auth.getSession(), client.auth.getSession()]);
    expect(results.every((result) => result.error !== null)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    offline = false;
    expect((await client.auth.getSession()).error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not join an old session request after a new login', async () => {
    let release!: (response: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    const oldRead = client.auth.getSession();
    await vi.waitFor(() => expect(release).toBeDefined());
    await client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    const newRead = client.auth.getSession();
    expect((await newRead).data.session?.user.id).toBe(user.id);
    release(new Response(JSON.stringify({ user: null, session: null }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    expect((await oldRead).data.session?.user.id).toBe(user.id);
  });

  it('keeps Admin and Customer session requests and profile state isolated', async () => {
    const admin = createBffSupabaseClient('admin', 'https://project.supabase.test', 'sb_publishable_test',
      new AuthPersistenceStorage('nestora-admin-auth'));
    await Promise.all([client.auth.getSession(), client.auth.getSession(), admin.auth.getSession(), admin.auth.getSession()]);
    expect(fetcher.mock.calls.filter(([path]) => String(path) === '/api/customer/auth/session')).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([path]) => String(path) === '/api/admin/auth/session')).toHaveLength(1);
    expect(admin.auth.customerProfile).toBeUndefined();
    await client.auth.signOut();
    expect(fetcher.mock.calls.some(([path]) => String(path) === '/api/admin/auth/logout')).toBe(false);
  });
});
