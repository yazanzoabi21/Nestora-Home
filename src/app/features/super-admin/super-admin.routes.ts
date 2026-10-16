import { Routes } from '@angular/router';
import { SuperAdminLayoutComponent } from '../../core/layouts/super-admin-layout';
import { roleGuard } from '../../core/guards/role.guard';

export const SUPER_ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: SuperAdminLayoutComponent,
    canActivate: [roleGuard],
    children: [],
  },
];
