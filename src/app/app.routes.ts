// import { Routes } from '@angular/router';

// export const routes: Routes = [
//   {
//     path: 'auth',
//     loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
//   },
//   {
//     path: 'admin',
//     loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
//   },
//   {
//     path: 'super-admin',
//     loadChildren: () => import('./features/super-admin/super-admin.routes').then((m) => m.SUPER_ADMIN_ROUTES),
//   },
//   {
//     path: 'shop',
//     loadChildren: () => import('./features/customer/customer.routes').then((m) => m.CUSTOMER_ROUTES),
//   },
// ];

import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full',
  },
  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'admin',
    loadChildren: () =>
      import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: 'super-admin',
    loadChildren: () =>
      import('./features/super-admin/super-admin.routes').then(
        (m) => m.SUPER_ADMIN_ROUTES
      ),
  },
  {
    path: 'shop',
    loadChildren: () =>
      import('./features/customer/customer.routes').then(
        (m) => m.CUSTOMER_ROUTES
      ),
  },
  {
    path: '**',
    redirectTo: 'auth/login',
  },
];