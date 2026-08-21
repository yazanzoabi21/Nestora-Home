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
});

function configureAuthService(): {
  readonly service: CustomerAuthService;
  readonly profileQuery: ReturnType<typeof vi.fn>;
  emitAuthState(event: AuthChangeEvent, session: Session | null): void;
} {
  let authStateHandler: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;
  const profileQuery = vi.fn(() => Promise.resolve({ data: PROFILE, error: null }));
  const eq = vi.fn(() => ({ maybeSingle: profileQuery }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  const supabase = {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: SESSION }, error: null })),
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
    emitAuthState(event: AuthChangeEvent, session: Session | null): void {
      authStateHandler?.(event, session);
    },
  };
}
