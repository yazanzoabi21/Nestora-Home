import { Component, ElementRef, HostListener, Input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface UserMenuUser {
  name: string;
  role: string;
  initials: string;
}

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.css',
})
export class UserMenuComponent {
  @Input() user: UserMenuUser = {
    name: 'Alex Johnson',
    role: 'Super Admin',
    initials: 'AJ',
  };

  readonly isOpen = signal(false);

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

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

  signOut(): void {
    // TODO: Add real sign-out logic.
    this.closeMenu();
  }
}
