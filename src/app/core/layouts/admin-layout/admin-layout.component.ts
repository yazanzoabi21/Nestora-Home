import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../../../shared/ui/sidebar';
import { TOPBAR_USER_FALLBACK, TopbarComponent, TopbarUser } from '../../../shared/ui/topbar';
import { AppRoleName, AuthenticatedUserProfile } from '../../models/auth';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent implements OnInit {
  private readonly authService = inject(AuthService);

  readonly sidebarCollapsed = signal(false);
  readonly mobileSidebarOpen = signal(false);
  readonly currentUser = computed<TopbarUser>(() => {
    const profile = this.authService.currentUserProfile();
    return profile ? this.toTopbarUser(profile) : TOPBAR_USER_FALLBACK;
  });
  readonly isLoadingUser = signal(true);
  readonly userError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.loadCurrentUser();
  }

  private async loadCurrentUser(): Promise<void> {
    try {
      const profile = await this.authService.getCurrentUserProfile();

      if (!profile || !profile.is_active) {
        await this.authService.logout();
        return;
      }

      this.userError.set(null);
    } catch (error) {
      this.userError.set(error instanceof Error ? error.message : 'Unable to load profile.');
      await this.authService.logout();
    } finally {
      this.isLoadingUser.set(false);
    }
  }

  private toTopbarUser(profile: AuthenticatedUserProfile): TopbarUser {
    const name = getDisplayName(profile);

    return {
      name,
      role: formatRoleName(profile.roles?.name),
      initials: getInitials(profile.full_name || profile.email),
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
