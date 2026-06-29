import { Component, ElementRef, HostListener, inject, Input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { TranslatePipe } from '@ngx-translate/core';

export interface UserMenuUser {
  name: string;
  role: string;
  initials: string;
}

const USER_MENU_FALLBACK: UserMenuUser = {
  name: 'Loading user',
  role: 'Loading',
  initials: '?',
};

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.css',
})
export class UserMenuComponent {
  @Input() user: UserMenuUser = USER_MENU_FALLBACK;

  private readonly authService = inject(AuthService);

  readonly isOpen = signal(false);

  constructor(private readonly elementRef: ElementRef<HTMLElement>) { }

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
    await this.authService.logout();
  }
}
