import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

import { AuthenticatedUserProfile } from '../../models/auth';
import { CUSTOMER_AUTH_PERSISTENCE, CUSTOMER_SUPABASE } from '../../tokens';
import { CustomerAuthService } from './customer-auth.service';

const SESSION = {
  user: {
    id: 'user-a',
    email: 'customer@example.com',
    user_metadata: {},
  },
} as unknown as Session;

const PROFILE: AuthenticatedUserProfile = {
  id: 'user-a',
  role_id: 'customer-role',
  full_name: 'Nestora Customer',
  email: 'customer@example.com',
  phone: null,
  avatar_url: null,
  is_active: true,
  created_at: '2026-08-21T00:00:00.000Z',
  roles: { id: 'customer-role', name: 'customer' },
};

describe('CustomerAuthService profile synchronization', () => {
  it('denies access when a restored customer profile is inactive', async () => {
    const { service } = configureAuthService();
    await service.initialize();
    service.currentCustomerProfile.set({ ...PROFILE, is_active: false });
    expect(service.isAuthenticated()).toBe(false);
    await expect(service.getCurrentUserId()).resolves.toBeNull();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('shares profile initialization between session restore and auth-state events', async () => {
    const { service, emitAuthState, profileQuery } = configureAuthService();

    emitAuthState('INITIAL_SESSION', SESSION);
    await service.initialize();
    await Promise.all([
      service.getCurrentCustomerProfile(),
      service.getCurrentCustomerProfile(),
    ]);

    expect(profileQuery).toHaveBeenCalledTimes(1);
    expect(service.currentCustomerProfile()).toEqual(PROFILE);
  });

  it('only queries again through the explicit profile refresh API', async () => {
    const { service, profileQuery } = configureAuthService();

    await service.initialize();
    await service.getCurrentCustomerProfile();
    expect(profileQuery).toHaveBeenCalledTimes(1);

    await service.refreshCurrentCustomerProfile();
    expect(profileQuery).toHaveBeenCalledTimes(2);
  });

  for (const failure of ['missing', 'inactive', 'wrong-role', 'query-error']) {
    it('cleans up customer authorization failure: ' + failure, async () => {
      const { service, profileQuery, signOut } = configureAuthService();
      await service.initialize();
      profileQuery.mockResolvedValue({ data: failure === 'missing' ? null : {
        ...PROFILE, is_active: failure !== 'inactive',
        roles: { id: 'role', name: failure === 'wrong-role' ? 'admin' : 'customer' },
      }, error: failure === 'query-error' ? { message: 'profile unavailable' } : null });
      await expect(service.login({ email: 'customer@example.com', password: 'secret' })).rejects.toThrow();
      expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(service.session()).toBeNull();
      expect(service.currentCustomerProfile()).toBeNull();
    });
  }

  it('forces a fresh same-user profile check on login', async () => {
    const { service, profileQuery } = configureAuthService();
    await service.initialize();
    await service.login({ email: 'customer@example.com', password: 'secret' });
    expect(profileQuery).toHaveBeenCalledTimes(2);
  });

  it('cleans up signup sessions when profile initialization fails', async () => {
    const { service, profileQuery, signOut } = configureAuthService();
    await service.initialize();
    profileQuery.mockResolvedValue({ data: null, error: { message: 'profile unavailable' } });
    await expect(service.register({ email: 'customer@example.com', password: 'secret', fullName: 'Name', phone: '123' }))
      .rejects.toThrow('profile unavailable');
    expect(service.session()).toBeNull();
    expect(signOut).toHaveBeenCalled();
  });

  it('keeps confirmation-required signup without an authenticated session', async () => {
    const { service, signUp, signOut } = configureAuthService();
    await service.initialize();
    await service.logout(false);
    signOut.mockClear();
    signUp.mockResolvedValue({ data: { user: SESSION.user, session: null }, error: null });
    await expect(service.register({ email: 'customer@example.com', password: 'secret', fullName: 'Name', phone: '123' }))
      .resolves.toEqual({ status: 'confirmation-required', email: 'customer@example.com' });
    expect(service.session()).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('keeps password recovery available after protected profile lookup fails', async () => {
    const { service, profileQuery, emitAuthState } = configureAuthService();
    await service.initialize();
    profileQuery.mockResolvedValue({ data: null, error: { message: 'denied' } });
    emitAuthState('PASSWORD_RECOVERY', SESSION);
    await expect(service.waitForPasswordRecoverySession()).resolves.toBe(SESSION);
    await expect(service.updatePasswordFromRecovery('new-secret')).resolves.toBeUndefined();
  });

  it('ignores late auth events after logout', async () => {
    const { service, emitAuthState } = configureAuthService();
    await service.initialize();
    await service.logout(false);
    emitAuthState('TOKEN_REFRESHED', SESSION);
    expect(service.session()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('completes Google callback while initial session restoration is pending', async () => {
    const { service } = configureAuthService();
    const persistence = TestBed.inject(CUSTOMER_AUTH_PERSISTENCE);
    persistence.setRememberSession(false);
    const remember = vi.spyOn(persistence, 'setRememberSession');
    sessionStorage.setItem('nestora-customer-oauth-return-url', '/shop/customer-account');
    await expect(service.completeGoogleSignIn()).resolves.toBe('/shop/customer-account');
    expect(service.isAuthenticated()).toBe(true);
    expect(remember).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('nestora-customer-oauth-return-url')).toBeNull();
  });

  it('retries initialization after a transient protected-profile error', async () => {
    const { service, profileQuery } = configureAuthService(true);
    await expect(service.initialize()).rejects.toThrow('temporarily unavailable');
    await expect(service.initialize()).resolves.toBeUndefined();
    expect(profileQuery).toHaveBeenCalledTimes(2);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('returns the initialized identity without an additional profile request', async () => {
    const { service, profileQuery } = configureAuthService();
    await service.initialize();
    profileQuery.mockResolvedValue({ data: { ...PROFILE, is_active: false }, error: null });
    await expect(service.getCurrentUserId()).resolves.toBe(PROFILE.id);
    expect(profileQuery).toHaveBeenCalledTimes(1);
    await service.refreshCurrentCustomerProfile();
    await expect(service.getCurrentUserId()).resolves.toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('does not publish a late profile refresh after logout', async () => {
    const { service, profileQuery } = configureAuthService();
    await service.initialize();
    let release!: (value: unknown) => void;
    profileQuery.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const refresh = service.refreshCurrentCustomerProfile();
    await vi.waitFor(() => expect(release).toBeDefined());
    await service.logout(false);
    release({ data: PROFILE, error: null });
    await expect(refresh).resolves.toBeNull();
    expect(service.session()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('cleans up a Google callback if the protected profile lookup fails', async () => {
    const { service, profileQuery, signOut } = configureAuthService();
    await service.initialize();
    profileQuery.mockResolvedValue({ data: null, error: { message: 'profile unavailable' } });
    await expect(service.completeGoogleSignIn()).rejects.toThrow('profile unavailable');
    expect(signOut).toHaveBeenCalled();
    expect(service.session()).toBeNull();
  });

  it('requests a neutral customer password reset with the current origin callback', async () => {
    const { service, resetPasswordForEmail } = configureAuthService();

    await service.requestPasswordReset(' Customer@Example.com ');

    expect(resetPasswordForEmail).toHaveBeenCalledWith('customer@example.com', {
      redirectTo: `${window.location.origin}/auth/customer-reset-password`,
    });
  });

  it('only updates a password after Supabase emits PASSWORD_RECOVERY', async () => {
    const { service, emitAuthState, updateUser, signOut } = configureAuthService();

    emitAuthState('PASSWORD_RECOVERY', SESSION);
    await expect(service.waitForPasswordRecoverySession()).resolves.toBe(SESSION);
    await service.updatePasswordFromRecovery('new-secret');

    expect(updateUser).toHaveBeenCalledWith({ password: 'new-secret' });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('rejects password updates without a recovery event', async () => {
    const { service, updateUser } = configureAuthService();

    await expect(service.updatePasswordFromRecovery('new-secret')).rejects.toThrow(
      'invalid or has expired',
    );
    expect(updateUser).not.toHaveBeenCalled();
  });
});

function configureAuthService(initialProfileError = false): {
  readonly service: CustomerAuthService;
  readonly profileQuery: ReturnType<typeof vi.fn>;
  readonly signInWithPassword: ReturnType<typeof vi.fn>;
  readonly signUp: ReturnType<typeof vi.fn>;
  readonly resetPasswordForEmail: ReturnType<typeof vi.fn>;
  readonly updateUser: ReturnType<typeof vi.fn>;
  readonly signOut: ReturnType<typeof vi.fn>;
  emitAuthState(event: AuthChangeEvent, session: Session | null): void;
} {
  let authStateHandler: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;
  let activeSession: Session | null = SESSION;
  const profileQuery = vi.fn();
  profileQuery.mockResolvedValue({ data: PROFILE, error: null });
  if (initialProfileError) profileQuery.mockResolvedValueOnce({
    data: null, error: { message: 'temporarily unavailable' },
  });
  const eq = vi.fn(() => ({ maybeSingle: profileQuery }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const resetPasswordForEmail = vi.fn(() => Promise.resolve({ data: {}, error: null }));
  const updateUser = vi.fn(() => Promise.resolve({ data: { user: SESSION.user }, error: null }));
  const signOut = vi.fn(async () => { activeSession = null; return { error: null }; });
  const signInWithPassword = vi.fn(async () => {
    activeSession = SESSION;
    return { data: { user: SESSION.user, session: SESSION }, error: null };
  });
  const signUp = vi.fn();
  signUp.mockResolvedValue({ data: { user: SESSION.user, session: SESSION }, error: null });

  const supabase = {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: activeSession }, error: null })),
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: SESSION.user }, error: null }),
      ),
      signInWithPassword, signUp,
      startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn(),
      resetPasswordForEmail,
      updateUser,
      signOut,
      onAuthStateChange: vi.fn(
        (handler: (event: AuthChangeEvent, session: Session | null) => void) => {
          authStateHandler = handler;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        },
      ),
    },
    from,
  } as unknown as SupabaseClient;

  TestBed.configureTestingModule({
    providers: [
      CustomerAuthService,
      { provide: CUSTOMER_SUPABASE, useValue: supabase },
      { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn() } },
    ],
  });

  return {
    service: TestBed.inject(CustomerAuthService),
    profileQuery,
    signInWithPassword, signUp,
    resetPasswordForEmail,
    updateUser,
    signOut,
    emitAuthState(event: AuthChangeEvent, session: Session | null): void {
      authStateHandler?.(event, session);
    },
  };
}
