import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { vi } from 'vitest';
import { AdminAuthService } from '../services/auth';
import { roleGuard } from './role.guard';

describe('super-admin role boundary', () => {
  const getCurrentUserProfile = vi.fn();

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminAuthService, useValue: { getCurrentUserProfile } },
      ],
    });
  });

  for (const role of ['admin', 'customer', 'super_admin']) {
    it(`checks the ${role} role`, async () => {
      getCurrentUserProfile.mockResolvedValue({ is_active: true, roles: { name: role } });
      const result = await TestBed.runInInjectionContext(() =>
        roleGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
      if (role === 'super_admin') expect(result).toBe(true);
      else expect(result).toEqual(TestBed.inject(Router).createUrlTree([
        role === 'admin' ? '/admin' : '/auth/login',
      ]));
    });
  }

  it('redirects inactive accounts to login', async () => {
    getCurrentUserProfile.mockResolvedValue({ is_active: false, roles: { name: 'super_admin' } });
    const result = await TestBed.runInInjectionContext(() =>
      roleGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    expect(result).toEqual(TestBed.inject(Router).createUrlTree(['/auth/login']));
  });
});
