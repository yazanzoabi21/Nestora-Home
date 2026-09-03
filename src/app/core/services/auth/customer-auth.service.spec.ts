import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

import { AuthenticatedUserProfile } from '../../models/auth';
import { CUSTOMER_SUPABASE } from '../../tokens';
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

function configureAuthService(): {
  readonly service: CustomerAuthService;
  readonly profileQuery: ReturnType<typeof vi.fn>;
  readonly resetPasswordForEmail: ReturnType<typeof vi.fn>;
  readonly updateUser: ReturnType<typeof vi.fn>;
  readonly signOut: ReturnType<typeof vi.fn>;
  emitAuthState(event: AuthChangeEvent, session: Session | null): void;
} {
  let authStateHandler: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;
  const profileQuery = vi.fn(() => Promise.resolve({ data: PROFILE, error: null }));
  const eq = vi.fn(() => ({ maybeSingle: profileQuery }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const resetPasswordForEmail = vi.fn(() => Promise.resolve({ data: {}, error: null }));
  const updateUser = vi.fn(() => Promise.resolve({ data: { user: SESSION.user }, error: null }));
  const signOut = vi.fn(() => Promise.resolve({ error: null }));

  const supabase = {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: SESSION }, error: null })),
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: SESSION.user }, error: null }),
      ),
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
    resetPasswordForEmail,
    updateUser,
    signOut,
    emitAuthState(event: AuthChangeEvent, session: Session | null): void {
      authStateHandler?.(event, session);
    },
  };
}
