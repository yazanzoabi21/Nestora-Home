import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AdminAuthService, CustomerAuthService } from '../services/auth';
import { authGuard } from './auth.guard';
import { roleGuard } from './role.guard';
import { permissionGuard } from './permission.guard';
import { guestGuard } from './guest.guard';
import { customerAuthGuard, customerGuestGuard } from './customer-auth.guard';
import { ADMIN_ROUTES } from '../../features/admin/admin.routes';

describe('authentication guard failure boundaries', () => {
  const isAuthenticated = vi.fn();
  const getCurrentUserProfile = vi.fn();
  const initialize = vi.fn();
  const customerIsAuthenticated = vi.fn();
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/shop/customer-account/orders' } as RouterStateSnapshot;

  beforeEach(() => {
    isAuthenticated.mockReset().mockRejectedValue(new Error('unavailable'));
    getCurrentUserProfile.mockReset().mockRejectedValue(new Error('unavailable'));
    initialize.mockReset().mockRejectedValue(new Error('unavailable'));
    customerIsAuthenticated.mockReset().mockReturnValue(false);
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: AdminAuthService, useValue: { isAuthenticated, getCurrentUserProfile } },
      { provide: CustomerAuthService, useValue: {
        initialize, isAuthenticated: customerIsAuthenticated,
      } },
    ] });
  });

  for (const [name, guard] of Object.entries({ authGuard, roleGuard, permissionGuard })) {
    it(name + ' denies protected navigation after an API failure', async () => {
      const result = await TestBed.runInInjectionContext(() => guard(route, state));
      expect(result).toEqual(TestBed.inject(Router).createUrlTree(['/auth/login']));
    });
  }

  it('preserves the customer destination after failed restoration', async () => {
    const result = await TestBed.runInInjectionContext(() => customerAuthGuard(route, state));
    expect(result).toEqual(TestBed.inject(Router).createUrlTree(['/auth/customer-login'], {
      queryParams: { returnUrl: state.url },
    }));
  });

  for (const guard of [guestGuard, customerGuestGuard]) {
    it('permits a login retry after session restoration fails', async () => {
      expect(await TestBed.runInInjectionContext(() => guard(route, state))).toBe(true);
    });
  }

  it('denies navigation when initialization fails even if UI state was authenticated', async () => {
    customerIsAuthenticated.mockReturnValue(true);
    expect(await TestBed.runInInjectionContext(() => customerAuthGuard(route, state))).not.toBe(true);
    expect(initialize).toHaveBeenCalledTimes(1);
  });
});

it('validates each Admin sidebar route once and denies direct entry after revocation', async () => {
  const isAuthenticated = vi.fn().mockResolvedValue(true);
  const adminRoutes = ADMIN_ROUTES.map((route) => ({
    ...route,
    component: undefined,
    children: route.children?.map((child) => child.redirectTo ? child : {
      ...child, loadComponent: undefined, children: [],
    }),
  }));
  TestBed.configureTestingModule({ providers: [
    provideRouter([{ path: 'admin', children: adminRoutes }, { path: 'auth/login', children: [] }]),
    { provide: AdminAuthService, useValue: { isAuthenticated } },
  ] });
  const router = TestBed.inject(Router);
  const pages = ['dashboard', 'products', 'inventory', 'orders', 'customers', 'categories'];
  for (const [index, page] of pages.entries()) {
    await expect(router.navigateByUrl('/admin/' + page)).resolves.toBe(true);
    expect(router.url).toBe('/admin/' + page);
    expect(isAuthenticated).toHaveBeenCalledTimes(index + 1);
  }
  isAuthenticated.mockResolvedValue(false);
  await router.navigateByUrl('/admin/products');
  expect(router.url).toBe('/auth/login');
});
