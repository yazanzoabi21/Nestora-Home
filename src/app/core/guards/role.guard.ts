import { CanActivateFn } from '@angular/router';

export const roleGuard: CanActivateFn = () => {
  // TODO: Add role checks for super_admin, admin, and customer access.
  return true;
};
