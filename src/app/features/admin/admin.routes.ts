import { Routes } from '@angular/router';
import { AdminLayoutComponent } from '../../core/layouts/admin-layout';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';
import { roleGuard } from '../../core/guards/role.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [authGuard, roleGuard, permissionGuard],
    children: [],
  },
];
