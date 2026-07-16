import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CustomerAuthService } from '../services/auth';

export const customerAuthGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(CustomerAuthService);
  const router = inject(Router);
  await auth.initialize();
  return auth.isAuthenticated()
    ? true
    : router.createUrlTree(['/auth/customer-login'], { queryParams: { returnUrl: state.url } });
};

export const customerGuestGuard: CanActivateFn = async () => {
  const auth = inject(CustomerAuthService);
  const router = inject(Router);
  await auth.initialize();
  return auth.isAuthenticated() ? router.createUrlTree(['/shop/customer-account']) : true;
};
