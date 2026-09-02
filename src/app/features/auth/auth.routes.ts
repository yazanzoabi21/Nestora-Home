import { Routes } from '@angular/router';
import { guestGuard } from '../../core/guards/guest.guard';
import { customerGuestGuard } from '../../core/guards/customer-auth.guard';

export const AUTH_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./pages/login').then((m) => m.LoginComponent),
    data: { audience: 'admin', initialMode: 'login' },
  },
  {
    path: 'customer-login',
    canActivate: [customerGuestGuard],
    loadComponent: () => import('./pages/login').then((m) => m.LoginComponent),
    data: { audience: 'customer', initialMode: 'login' },
  },
  {
    path: 'customer-register',
    canActivate: [customerGuestGuard],
    loadComponent: () => import('./pages/login').then((m) => m.LoginComponent),
    data: { audience: 'customer', initialMode: 'register' },
  },
  {
    path: 'customer-forgot-password',
    canActivate: [customerGuestGuard],
    loadComponent: () =>
      import('./pages/customer-forgot-password/customer-forgot-password.component').then(
        (m) => m.CustomerForgotPasswordComponent,
      ),
  },
  {
    path: 'customer-reset-password',
    loadComponent: () =>
      import('./pages/customer-reset-password/customer-reset-password.component').then(
        (m) => m.CustomerResetPasswordComponent,
      ),
  },
  {
    path: 'customer-callback',
    loadComponent: () =>
      import('./pages/customer-auth-callback/customer-auth-callback.component').then(
        (m) => m.CustomerAuthCallbackComponent,
      ),
  },
];
