import { Routes } from '@angular/router';
import { CustomerLayoutComponent } from './components/customer-layout/customer-layout.component';
import { customerAuthGuard } from '../../core/guards/customer-auth.guard';

export const CUSTOMER_ROUTES: Routes = [
  {
    path: '',
    component: CustomerLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./home/pages/home-page/home-page.component').then((m) => m.HomePageComponent),
      },
      {
        path: 'home',
        loadComponent: () =>
          import('./home/pages/home-page/home-page.component').then((m) => m.HomePageComponent),
      },
      {
        path: 'products',
        loadComponent: () => import('./pages/all-products').then((m) => m.AllProducts),
      },
      {
        path: 'products/:identifier',
        loadComponent: () => import('./product-details').then((m) => m.ProductDetailsComponent),
      },

      {
        path: 'flash-deals',
        loadComponent: () => import('./promotions/pages/flash-deals').then((m) => m.FlashDealsPage),
      },
      {
        path: 'promotions/:slug',
        loadComponent: () =>
          import('./promotions/pages/promotion-details').then((m) => m.PromotionDetails),
      },

      {
        path: 'all-products',
        redirectTo: 'products',
        pathMatch: 'full',
      },
      {
        path: 'new-arrivals',
        loadComponent: () => import('./pages/new-arrivals').then((m) => m.NewArrivalsComponent),
      },
      {
        path: 'best-sellers',
        loadComponent: () =>
          import('./pages/best-sellers/best-sellers').then((m) => m.BestSellersPage),
      },
      {
        path: 'cart',
        loadComponent: () => import('./cart').then((m) => m.CustomerCartComponent),
      },
      {
        path: 'checkout',
        loadComponent: () => import('./checkout').then((m) => m.CustomerCheckoutComponent),
      },
      {
        path: 'orders',
        redirectTo: 'customer-account/orders',
        pathMatch: 'full',
      },
      {
        path: 'customer-account',
        canActivate: [customerAuthGuard],
        loadComponent: () =>
          import('./components/customer-account/customer-account.component').then(
            (m) => m.CustomerAccountComponent,
          ),
        children: [
          { path: '', redirectTo: 'profile', pathMatch: 'full' },
          {
            path: 'profile',
            loadComponent: () =>
              import('./components/customer-account-profile/customer-account-profile.component').then(
                (m) => m.CustomerAccountProfileComponent,
              ),
          },
          {
            path: 'orders',
            loadComponent: () => import('./orders').then((m) => m.CustomerOrdersComponent),
          },
          {
            path: 'points',
            loadComponent: () =>
              import('./loyalty-points').then((m) => m.CustomerLoyaltyPointsPageComponent),
          },
          {
            path: 'wishlist',
            loadComponent: () => import('./wishlist').then((m) => m.CustomerWishlistComponent),
          },
          {
            path: 'addresses',
            loadComponent: () =>
              import('./components/customer-account-addresses/customer-account-addresses.component').then(
                (m) => m.CustomerAccountAddressesComponent,
              ),
          },
          {
            path: 'settings',
            loadComponent: () =>
              import('./components/customer-settings/customer-settings').then(
                (m) => m.CustomerSettings,
              ),
          },
        ],
      },
    ],
  },
];
