import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AdminAuthService } from '../services/auth';

export const guestGuard: CanActivateFn = async () => {
    const authService = inject(AdminAuthService);
    const router = inject(Router);

    let isAuthenticated = false;
    try { isAuthenticated = await authService.isAuthenticated(); } catch { /* Allow retry at login. */ }

    if (isAuthenticated) {
        return router.createUrlTree(['/admin']);
    }

    return true;
};
