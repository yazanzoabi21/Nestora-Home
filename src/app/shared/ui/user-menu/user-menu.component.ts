import { ToastService } from '../../../core/services/toast.service';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, Input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminAuthService } from '../../../core/services/auth';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

export interface UserMenuUser {
  name: string;
  role: string;
  initials: string;
  avatarUrl: string | null;
}

const USER_MENU_FALLBACK: UserMenuUser = {
  name: 'Loading user',
  role: 'Loading',
  initials: '?',
  avatarUrl: null,
};

const DEFAULT_AVATAR_URL = 'assets/images/default-avatar.svg';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-user-menu',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.css',
})
export class UserMenuComponent {
  @Input() user: UserMenuUser = USER_MENU_FALLBACK;

  private readonly authService = inject(AdminAuthService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  readonly isOpen = signal(false);

  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  avatarSrc(): string {
    return this.user.avatarUrl || DEFAULT_AVATAR_URL;
  }

  onAvatarError(event: Event): void {
    const image = event.target as HTMLImageElement;
    image.src = DEFAULT_AVATAR_URL;
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.isOpen.set(false);
  }

  toggleMenu(): void {
    this.isOpen.update((isOpen) => !isOpen);
  }

  closeMenu(): void {
    this.isOpen.set(false);
  }

  async signOut(): Promise<void> {
    this.closeMenu();
    const result = await this.authService.logout();
    if (!result.localSessionCleared || !result.remoteRevocationConfirmed) {
      this.toast.warn(this.translate.instant(result.localSessionCleared
        ? 'AUTH.ERRORS.LOGOUT_UNCONFIRMED' : 'AUTH.ERRORS.LOGOUT_LOCAL_FAILED') as string);
    }
  }
}
