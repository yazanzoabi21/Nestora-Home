import { CanActivateFn } from '@angular/router';

export const permissionGuard: CanActivateFn = () => {
  // TODO: Add permission checks for assigned admin modules and actions.
  return true;
};
