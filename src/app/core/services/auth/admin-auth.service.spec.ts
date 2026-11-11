import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { ADMIN_SUPABASE } from '../../tokens';
import { AdminAuthService } from './admin-auth.service';
import { AuthApiError, type SupabaseClient } from '@supabase/supabase-js';

describe('AdminAuthService authorization and cleanup', () => {
  const profileQuery = vi.fn();
  const signInWithPassword = vi.fn();
  const signOut = vi.fn();
  const update = vi.fn();
  const navigate = vi.fn();
  let activeSession: { user: { id: string } } | null;
  let service: AdminAuthService;
  let authEvent: Parameters<SupabaseClient['auth']['onAuthStateChange']>[0];

  beforeEach(() => {
    activeSession = { user: { id: 'test-user' } };
    profileQuery.mockReset().mockResolvedValue({
      data: { id: 'test-user', is_active: true, roles: { name: 'admin' } }, error: null,
    });
    update.mockReset(); navigate.mockReset().mockResolvedValue(true);
    signInWithPassword.mockReset().mockImplementation(async () => ({
      data: { user: { id: 'test-user' }, session: activeSession }, error: null,
    }));
    signOut.mockReset().mockImplementation(async () => { activeSession = null; return { error: null }; });
    TestBed.configureTestingModule({ providers: [
      { provide: Router, useValue: { url: '/admin', navigate, navigateByUrl: navigate } },
      { provide: ADMIN_SUPABASE, useValue: {
        auth: {
          getSession: vi.fn(async () => ({ data: { session: activeSession }, error: null })),
          signInWithPassword, signOut,
          startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn(),
          onAuthStateChange: vi.fn((callback: typeof authEvent) => {
            authEvent = callback;
            return { data: { subscription: { unsubscribe: vi.fn() } } };
          }),
        },
        from: vi.fn(() => ({ update, select: vi.fn(() => ({ eq: vi.fn(() => ({
          maybeSingle: profileQuery, retry: () => ({ maybeSingle: profileQuery }),
        })) })) })),
      } },
    ] });
    service = TestBed.inject(AdminAuthService);
  });

  for (const is_active of [false, null]) {
    it('rejects inactive or NULL restored admin profiles', async () => {
      profileQuery.mockResolvedValue({ data: { is_active, roles: { name: 'admin' } }, error: null });
      await expect(service.isAuthenticated()).resolves.toBe(false);
      expect(service.currentUserProfile()).toBeNull();
    });
  }

  it('shares concurrent checks without caching later navigations', async () => {
    await Promise.all([service.isAuthenticated(), service.getCurrentUserProfile()]);
    expect(profileQuery).toHaveBeenCalledTimes(1);
    await service.isAuthenticated();
    expect(profileQuery).toHaveBeenCalledTimes(2);
  });

  for (const failure of ['missing', 'inactive', 'wrong-role', 'query-error']) {
    it('cleans up failed post-login authorization: ' + failure, async () => {
      profileQuery.mockResolvedValue({ data: failure === 'missing' ? null : {
        id: 'test-user', is_active: failure !== 'inactive',
        roles: { name: failure === 'wrong-role' ? 'customer' : 'admin' },
      }, error: failure === 'query-error' ? { message: 'profile unavailable' } : null });
      await expect(service.login({ email: 'admin@example.com', password: 'secret' })).rejects.toThrow();
      expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(activeSession).toBeNull();
      expect(service.currentUserProfile()).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });
  }

  it('does not undo an authorized login when navigation fails', async () => {
    navigate.mockRejectedValue(new Error('navigation failed'));
    await expect(service.login({ email: 'admin@example.com', password: 'secret' })).rejects.toThrow('navigation');
    expect(service.currentUserProfile()).not.toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  for (const [status, code] of [[400, 'invalid_credentials'], [503, 'unexpected_failure']] as const) {
    it(`preserves an existing Admin session after a rejected provider login: ${code}`, async () => {
      await service.getCurrentUserProfile();
      const previous = service.currentUserProfile();
      signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: new AuthApiError('Provider failure', status, code) });
      await expect(service.login({ email: 'admin@example.com', password: 'secret' })).rejects.toMatchObject({ status, code });
      expect(signOut).not.toHaveBeenCalled();
      expect(service.currentUserProfile()).toBe(previous);
      expect(activeSession).not.toBeNull();
    });
  }

  it('rejects runtime privilege injection before sending a profile mutation', async () => {
    await expect(service.updateCurrentUserProfile({ full_name: 'Name', ...{ role_id: 'super-admin' } }))
      .rejects.toThrow('restricted');
    expect(update).not.toHaveBeenCalled();
  });

  it('does not publish a profile response after logout', async () => {
    let release!: (value: unknown) => void;
    profileQuery.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const read = service.getCurrentUserProfile();
    await vi.waitFor(() => expect(profileQuery).toHaveBeenCalled());
    await service.logout();
    release({ data: { id: 'test-user', is_active: true, roles: { name: 'admin' } }, error: null });
    await expect(read).resolves.toBeNull();
    expect(service.currentUserProfile()).toBeNull();
  });

  it('clears an externally signed-out admin and redirects only the admin area', async () => {
    await service.getCurrentUserProfile();
    authEvent('SIGNED_OUT', null);
    expect(service.currentUserProfile()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/auth/login'], { replaceUrl: true });
  });

  it('does not interrupt a customer page when the independent admin session signs out', async () => {
    await service.getCurrentUserProfile();
    Object.defineProperty(TestBed.inject(Router), 'url', { value: '/shop/checkout' });
    authEvent('SIGNED_OUT', null);
    expect(service.currentUserProfile()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
