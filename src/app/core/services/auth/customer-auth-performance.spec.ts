import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { AuthenticatedUserProfile } from '../../models/auth';
import { CUSTOMER_SUPABASE } from '../../tokens';
import { AuthPersistenceStorage } from '../../tokens/supabase.tokens';
import { customerAuthGuard, customerGuestGuard } from '../../guards/customer-auth.guard';
import { createBffSupabaseClient } from '../bff/bff-supabase-client';
import { CustomerAuthService } from './customer-auth.service';

const user = { id: 'customer-id', email: 'customer@example.com', user_metadata: {}, app_metadata: {} };
const initialProfile: AuthenticatedUserProfile = {
  id: user.id, role_id: 'customer-role', full_name: 'Customer', email: user.email,
  phone: null, avatar_url: null, is_active: true, created_at: '2026-01-01',
  roles: { id: 'customer-role', name: 'customer' },
};

// Runs the real browser adapter, customer service and guards with a repeatable
// 20 ms HTTP fixture. Timings measure this fixture, not a deployed Supabase stack.
describe('Phase 1 customer authentication request budget', () => {
  let requests: string[];
  let profile: AuthenticatedUserProfile;
  let authenticated: boolean;
  let client: ReturnType<typeof createBffSupabaseClient>;

  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    requests = []; profile = { ...initialProfile }; authenticated = true;
    vi.stubGlobal('BroadcastChannel', undefined);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      requests.push(`${init?.method ?? 'GET'} ${path.split('?')[0]}`);
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      const response = (value: unknown) => new Response(JSON.stringify(value), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
      if (path === '/api/csrf') return response({ csrfToken: 'C'.repeat(43) });
      if (path.endsWith('/auth/login')) authenticated = true;
      if (path.endsWith('/auth/logout')) {
        authenticated = false;
        return response({ localSessionCleared: true, remoteRevocationConfirmed: true });
      }
      if (path.includes('/auth/')) return response({ user: authenticated ? user : null,
        session: authenticated ? { user } : null, profile: authenticated ? profile : null });
      if (path.includes('/profiles')) {
        if (init?.method === 'PATCH') {
          profile = { ...profile, ...JSON.parse(String(init.body)) as Partial<AuthenticatedUserProfile> };
          return response(profile);
        }
        return response([profile]);
      }
      return response([]);
    }));
    client = createBffSupabaseClient('customer', 'https://project.supabase.test', 'sb_publishable_test',
      new AuthPersistenceStorage('nestora-customer-auth'));
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: CUSTOMER_SUPABASE, useValue: client },
    ] });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function measure(name: string, action: () => Promise<unknown>) {
    requests.length = 0;
    const started = performance.now();
    await action();
    const counts = {
      session: requests.filter((path) => path.endsWith('/auth/session')).length,
      profiles: requests.filter((path) => path.endsWith('/profiles')).length,
      logout: requests.filter((path) => path.endsWith('/auth/logout')).length,
      total: requests.length,
    };
    console.info('AUTH_REQUEST_BUDGET', JSON.stringify({ name, ...counts, elapsedMs: Math.round(performance.now() - started) }));
    return counts;
  }

  it('restores from one session response with no additional profile query', async () => {
    const counts = await measure('restoration', () => TestBed.inject(CustomerAuthService).initialize());
    expect(counts).toMatchObject({ session: 1, profiles: 0 });
    expect(TestBed.inject(CustomerAuthService).currentCustomerProfile()).toEqual(profile);
  });

  it('reuses the login profile', async () => {
    const service = TestBed.inject(CustomerAuthService); await service.initialize();
    const counts = await measure('login', () => service.login({ email: user.email, password: 'fixture-password' }));
    expect(counts).toMatchObject({ session: 0, profiles: 0 });
    expect(service.isAuthenticated()).toBe(true);
  });

  it('shares five simultaneous session reads', async () => {
    const counts = await measure('five concurrent session reads', () => Promise.all(
      Array.from({ length: 5 }, () => client.auth.getSession()),
    ));
    expect(counts.session).toBe(1);
  });

  it('returns IDs and handles navigation without refreshing the profile', async () => {
    const service = TestBed.inject(CustomerAuthService); await service.initialize();
    const counts = await measure('five ID reads and two guards', async () => {
      for (let i = 0; i < 5; i++) expect(await service.getCurrentUserId()).toBe(user.id);
      const route = {} as ActivatedRouteSnapshot;
      const state = { url: '/shop/customer-account/orders' } as RouterStateSnapshot;
      expect(await TestBed.runInInjectionContext(() => customerAuthGuard(route, state))).toBe(true);
      expect(await TestBed.runInInjectionContext(() => customerGuestGuard(route, state))).not.toBe(true);
    });
    expect(counts.total).toBe(0);
  });

  it('shares callback initialization and restoration', async () => {
    const counts = await measure('callback including restoration', () => TestBed.inject(CustomerAuthService).completeGoogleSignIn());
    expect(counts).toMatchObject({ session: 1, profiles: 0 });
    expect(TestBed.inject(CustomerAuthService).isAuthenticated()).toBe(true);
  });

  it('invalidates the server session with one logout request', async () => {
    const service = TestBed.inject(CustomerAuthService); await service.initialize();
    const counts = await measure('logout', async () => {
      expect(await service.logout(false)).toEqual({ localSessionCleared: true, remoteRevocationConfirmed: true });
    });
    expect(counts).toMatchObject({ session: 0, logout: 1 });
    expect(service.isAuthenticated()).toBe(false);
  });

  it('keeps edits and explicit refreshes current without restoring an old snapshot', async () => {
    const service = TestBed.inject(CustomerAuthService); await service.initialize();
    await service.updateProfile({ full_name: 'Updated customer', phone: null, birthday: null });
    await service.getCurrentCustomerProfile();
    expect(service.displayName()).toBe('Updated customer');
    profile = { ...profile, full_name: 'Changed on server' };
    await service.refreshCurrentCustomerProfile();
    await service.getCurrentCustomerProfile();
    expect(service.displayName()).toBe('Changed on server');
    await client.auth.getSession();
    expect(service.displayName()).toBe('Changed on server');
  });

  it('ignores a session/profile response that predates a profile edit', async () => {
    const service = TestBed.inject(CustomerAuthService); await service.initialize();
    let release!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    const oldRead = client.auth.getSession();
    await vi.waitFor(() => expect(release).toBeDefined());
    await service.updateProfile({ full_name: 'Updated customer', phone: null, birthday: null });
    release(new Response(JSON.stringify({ user, session: { user }, profile: initialProfile }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    await oldRead;
    await service.getCurrentCustomerProfile();
    expect(service.displayName()).toBe('Updated customer');
    expect(client.auth.customerProfile).toBeUndefined();
  });

  it('applies a changed same-user profile returned by a subsequent session validation', async () => {
    const service = TestBed.inject(CustomerAuthService); await service.initialize();
    profile = { ...profile, full_name: 'Changed in another tab' };
    await client.auth.getSession();
    expect(service.displayName()).toBe('Changed in another tab');
  });

  it('does not query a protected profile for a recovery-only session', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ user, session: { user }, profile: null, recovery: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    const service = TestBed.inject(CustomerAuthService); await service.initialize();
    expect(service.isAuthenticated()).toBe(false);
    expect(await service.waitForPasswordRecoverySession()).not.toBeNull();
    expect(requests.some((path) => path.endsWith('/profiles'))).toBe(false);
  });

  it('reports local invalidation independently of uncertain remote revocation without a second logout', async () => {
    const service = TestBed.inject(CustomerAuthService); await service.initialize();
    // Warm the shared CSRF request before replacing the logout response.
    await client.auth.changePassword?.('fixture-current', 'fixture-new');
    vi.mocked(fetch).mockClear().mockResolvedValueOnce(new Response(JSON.stringify({
      localSessionCleared: true, remoteRevocationConfirmed: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    expect(await service.logout(false)).toEqual({ localSessionCleared: true, remoteRevocationConfirmed: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('nestora-customer-bff-logout-pending')).toBeNull();
  });
});
