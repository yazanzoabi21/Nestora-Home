import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AdminAuthService } from '../services/auth';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AdminAuthService);
  const router = inject(Router);

  let isAuthenticated = false;
  try {
    isAuthenticated = await authService.isAuthenticated();
  } catch {
    // Keep the current page during an outage. The destination still requires
    // a successful live authorization check.
    if (authService.currentUserProfile()) return false;
  }

  if (!isAuthenticated) {
    return router.createUrlTree(['/auth/login']);
  }

  return true;
};
