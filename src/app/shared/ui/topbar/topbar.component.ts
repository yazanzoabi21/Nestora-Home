import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthenticatedUserProfile } from '../../../core/models/auth';
import { AuthService } from '../../../core/services/auth';
import { TranslationService } from '../../../core/services/translation';
import { UserMenuComponent } from '../user-menu';

export interface TopbarUser {
  name: string;
  role: string;
  initials: string;
  avatarUrl: string | null;
}

export const TOPBAR_USER_FALLBACK: TopbarUser = {
  name: 'Loading user',
  role: 'Loading',
  initials: '?',
  avatarUrl: null,
};

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [TranslatePipe, UserMenuComponent],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.css',
})
export class TopbarComponent implements OnInit {
  private readonly authService = inject(AuthService);

  readonly translation = inject(TranslationService);

  private readonly inputUser = signal<TopbarUser | null>(null);
  private readonly loadedUser = signal<TopbarUser>(TOPBAR_USER_FALLBACK);

  readonly topbarUser = computed(() => {
    const input = this.inputUser();

    if (input && input.name !== TOPBAR_USER_FALLBACK.name) {
      return input;
    }

    return this.loadedUser();
  });

  @Input()
  set user(value: TopbarUser | null | undefined) {
    this.inputUser.set(value ?? null);
  }

  @Input() sidebarCollapsed = false;
  @Output() menuClick = new EventEmitter<void>();

  readonly dateLabel = 'Wednesday, 22 April 2026';
  readonly notificationCount = 3;

  async ngOnInit(): Promise<void> {
    await this.loadCurrentUser();
  }

  @HostListener('window:current-user-profile-updated', ['$event'])
  onCurrentUserProfileUpdated(event: Event): void {
    const profile = (event as CustomEvent<AuthenticatedUserProfile>).detail;

    if (profile) {
      this.loadedUser.set(this.mapProfileToTopbarUser(profile));
      return;
    }

    void this.loadCurrentUser();
  }

  switchLanguage(): void {
    this.translation.toggleLanguage();
  }

  private async loadCurrentUser(): Promise<void> {
    try {
      const profile = await this.authService.getCurrentUserProfile();

      if (!profile) {
        this.loadedUser.set({
          name: 'User',
          role: 'Admin',
          initials: 'U',
          avatarUrl: null,
        });
        return;
      }

      this.loadedUser.set(this.mapProfileToTopbarUser(profile));
    } catch {
      this.loadedUser.set({
        name: 'User',
        role: 'Admin',
        initials: 'U',
        avatarUrl: null,
      });
    }
  }

  private mapProfileToTopbarUser(profile: AuthenticatedUserProfile): TopbarUser {
    const name =
      profile.full_name?.trim() ||
      getNameFromEmail(profile.email) ||
      'User';

    return {
      name,
      role: formatRoleName(profile.roles?.name),
      initials: getInitials(name || profile.email),
      avatarUrl: profile.avatar_url ?? null,
    };
  }
}

function getNameFromEmail(email: string | null | undefined): string {
  return email?.split('@')[0]?.trim() || '';
}

function getInitials(value: string | null | undefined): string {
  const cleanValue = value?.trim() ?? '';

  if (!cleanValue) {
    return '?';
  }

  const parts = cleanValue.includes('@')
    ? [cleanValue.split('@')[0]]
    : cleanValue.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatRoleName(role: string | null | undefined): string {
  if (!role) {
    return 'Admin';
  }

  return role
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}