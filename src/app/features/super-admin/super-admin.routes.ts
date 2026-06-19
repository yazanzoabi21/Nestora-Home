import { Routes } from '@angular/router';
import { SuperAdminLayoutComponent } from '../../core/layouts/super-admin-layout';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';
import { roleGuard } from '../../core/guards/role.guard';

export const SUPER_ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: SuperAdminLayoutComponent,
    canActivate: [authGuard, roleGuard, permissionGuard],
    children: [],
  },
];
