// import { Routes } from '@angular/router';
// import { AdminLayoutComponent } from '../../core/layouts/admin-layout';
// import { authGuard } from '../../core/guards/auth.guard';
// import { permissionGuard } from '../../core/guards/permission.guard';
// import { roleGuard } from '../../core/guards/role.guard';

// export const ADMIN_ROUTES: Routes = [
//   {
//     path: '',
//     component: AdminLayoutComponent,
//     canActivate: [authGuard, roleGuard, permissionGuard],
//     children: [],
//   },
// ];

import { Routes } from '@angular/router';
import { AdminLayoutComponent } from '../../core/layouts/admin-layout';
import { authGuard } from '../../core/guards/auth.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./products').then((m) => m.ProductsComponent),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./categories').then((m) => m.CategoriesComponent),
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import('./inventory').then((m) => m.InventoryComponent),
      },
      {
        path: 'reviews',
        loadComponent: () =>
          import('./reviews').then((m) => m.ReviewsComponent),
      },
      {
        path: 'discounts',
        loadComponent: () =>
          import('./discounts').then((m) => m.DiscountsComponent),
      },
      {
        path: 'promotions-ads',
        loadComponent: () =>
          import('./promotions-ads').then((m) => m.PromotionsAdsComponent),
      },
      {
        path: 'media-library',
        loadComponent: () =>
          import('./media-library').then((m) => m.MediaLibraryComponent),
      },
      {
        path: 'shipping',
        loadComponent: () =>
          import('./shipping').then((m) => m.ShippingComponent),
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('./payments').then((m) => m.PaymentsComponent),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./orders').then((m) => m.OrdersComponent),
      },
      
      // {
      //   path: 'discounts',
      //   redirectTo: 'promotions',
      //   pathMatch: 'full',
      // },
      {
        path: 'profile',
        loadComponent: () =>
          import('./profile').then((m) => m.ProfileComponent),
      },
      {
        path: 'help-support',
        loadComponent: () =>
          import('./help-support').then((m) => m.HelpSupportComponent),
      },
    ],
  },
];
