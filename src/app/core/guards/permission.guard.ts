import { CanActivateFn } from '@angular/router';
import { authGuard } from './auth.guard';

// Baseline active-admin check; module/action permissions remain server-enforced.
export const permissionGuard: CanActivateFn = (route, state) => authGuard(route, state);
