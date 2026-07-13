import { Routes } from '@angular/router';
import { CustomerLayoutComponent } from './components/customer-layout/customer-layout.component';

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
        path: 'all-products',
        redirectTo: 'products',
        pathMatch: 'full',
      },
      {
        path: 'new-arrivals',
        loadComponent: () => import('./pages/new-arrivals').then((m) => m.NewArrivalsComponent),
      },
      {
        path: 'cart',
        loadComponent: () => import('./cart').then((m) => m.CustomerCartComponent),
      },
    ],
  },
];
