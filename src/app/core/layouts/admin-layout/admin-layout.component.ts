import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../../../shared/ui/sidebar';
import { TOPBAR_USER_FALLBACK, TopbarComponent, TopbarUser } from '../../../shared/ui/topbar';
import { AppRoleName, AuthenticatedUserProfile } from '../../models/auth';
import { AdminAuthService } from '../../services/auth';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent {
  private readonly authService = inject(AdminAuthService);

  readonly sidebarCollapsed = signal(false);
  readonly mobileSidebarOpen = signal(false);
  readonly currentUser = computed<TopbarUser>(() => {
    const profile = this.authService.currentUserProfile();
    return profile ? this.toTopbarUser(profile) : TOPBAR_USER_FALLBACK;
  });
  openMobileSidebar(): void {
    this.mobileSidebarOpen.set(true);
  }

  closeMobileSidebar(): void {
    this.mobileSidebarOpen.set(false);
  }

  private toTopbarUser(profile: AuthenticatedUserProfile): TopbarUser {
    const name = getDisplayName(profile);

    return {
      name,
      role: formatRoleName(profile.roles?.name),
      initials: getInitials(profile.full_name || profile.email),
      avatarUrl: profile.avatar_url,
    };
  }
}

function getDisplayName(profile: AuthenticatedUserProfile): string {
  const fullName = profile.full_name?.trim();

  if (fullName) {
    return fullName;
  }

  return profile.email.split('@')[0] || profile.email;
}

function getInitials(value: string): string {
  const cleanValue = value.trim();

  if (!cleanValue) {
    return '?';
  }

  const parts = cleanValue.includes('@')
    ? [cleanValue.split('@')[0]]
    : cleanValue.split(/\s+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function formatRoleName(roleName: AppRoleName | undefined): string {
  switch (roleName) {
    case 'super_admin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    case 'customer':
      return 'Customer';
    default:
      return 'Not provided';
  }
}
