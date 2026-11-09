import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/auth';

export const roleGuard: CanActivateFn = async () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  const profile = await auth.getCurrentUserProfile().catch(() => null);
  return profile?.is_active === true && profile.roles?.name === 'super_admin'
    ? true
    : router.createUrlTree([
      profile?.is_active === true && profile.roles?.name === 'admin' ? '/admin' : '/auth/login',
    ]);
};
