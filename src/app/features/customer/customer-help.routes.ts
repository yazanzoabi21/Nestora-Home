import { Routes } from '@angular/router';

import { CustomerLayoutComponent } from './components/customer-layout/customer-layout.component';

export const CUSTOMER_HELP_ROUTES: Routes = [
  {
    path: '',
    component: CustomerLayoutComponent,
    children: [
      {
        path: 'about-us',
        loadComponent: () =>
          import('./pages/content-page').then((m) => m.CustomerContentPageComponent),
        data: { contentSlug: 'about-us' },
      },
      {
        path: 'contact-us',
        loadComponent: () =>
          import('./pages/contact').then((m) => m.CustomerContactComponent),
      },
      {
        path: 'faq',
        loadComponent: () => import('./pages/faq').then((m) => m.CustomerFaqComponent),
      },
      {
        path: 'shipping-policy',
        loadComponent: () =>
          import('./pages/content-page').then((m) => m.CustomerContentPageComponent),
        data: { contentSlug: 'shipping-policy' },
      },
      {
        path: 'return-policy',
        loadComponent: () =>
          import('./pages/content-page').then((m) => m.CustomerContentPageComponent),
        data: { contentSlug: 'return-policy' },
      },
      {
        path: 'privacy-policy',
        loadComponent: () =>
          import('./pages/content-page').then((m) => m.CustomerContentPageComponent),
        data: { contentSlug: 'privacy-policy' },
      },
    ],
  },
];
