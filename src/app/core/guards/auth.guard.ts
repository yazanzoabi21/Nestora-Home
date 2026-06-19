import { CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = () => {
  // TODO: Add authentication checks when auth state is implemented.
  return true;
};
