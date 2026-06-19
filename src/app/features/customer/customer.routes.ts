import { Routes } from '@angular/router';
import { CustomerLayoutComponent } from '../../core/layouts/customer-layout';
import { authGuard } from '../../core/guards/auth.guard';
import { roleGuard } from '../../core/guards/role.guard';

export const CUSTOMER_ROUTES: Routes = [
  {
    path: '',
    component: CustomerLayoutComponent,
    canActivate: [authGuard, roleGuard],
    children: [],
  },
];
