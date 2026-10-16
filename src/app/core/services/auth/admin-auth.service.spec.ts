import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ADMIN_SUPABASE } from '../../tokens';
import { AdminAuthService } from './admin-auth.service';

describe('AdminAuthService restored access', () => {
  const profileQuery = vi.fn();
  let service: AdminAuthService;

  beforeEach(() => {
    profileQuery.mockReset().mockResolvedValue({
      data: { is_active: true, roles: { name: 'admin' } }, error: null,
    });
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: ADMIN_SUPABASE, useValue: {
        auth: { getSession: vi.fn(async () => ({
          data: { session: { user: { id: 'test-user' } } }, error: null,
        })) },
        from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({
          maybeSingle: profileQuery,
        })) })) })),
      } },
    ] });
    service = TestBed.inject(AdminAuthService);
  });

  it('rejects inactive restored admin profiles', async () => {
    profileQuery.mockResolvedValue({
      data: { is_active: false, roles: { name: 'admin' } }, error: null,
    });
    await expect(service.isAuthenticated()).resolves.toBe(false);
    expect(service.currentUserProfile()).toBeNull();
  });

  it('shares concurrent profile checks without caching later navigations', async () => {
    await Promise.all([service.isAuthenticated(), service.getCurrentUserProfile()]);
    expect(profileQuery).toHaveBeenCalledTimes(1);
    await service.isAuthenticated();
    expect(profileQuery).toHaveBeenCalledTimes(2);
  });
});
