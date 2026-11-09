import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AdminGlobalSearchService, AdminSearchResult } from '../../../core/services/navigation';
import { TranslationService } from '../../../core/services/translation';
import { UserMenuComponent } from '../user-menu';

import { AdminNotificationsService } from '../../../data-access/services/admin-notifications.service';
import { AdminNotificationsPopoverComponent } from '../admin-notifications-popover/admin-notifications-popover.component';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-topbar',
  standalone: true,
  imports: [TranslatePipe, UserMenuComponent, UserMenuComponent, AdminNotificationsPopoverComponent,],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.css',
})
export class TopbarComponent implements OnInit {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly globalSearch = inject(AdminGlobalSearchService);
  private readonly router = inject(Router);

  readonly translation = inject(TranslationService);

  private readonly inputUser = signal<TopbarUser | null>(null);
  readonly searchQuery = signal('');
  readonly searchOpen = signal(false);
  readonly searchResults = computed(() => this.globalSearch.search(this.searchQuery()));

  readonly topbarUser = computed(() => this.inputUser() ?? TOPBAR_USER_FALLBACK);

  private readonly notificationsService = inject(AdminNotificationsService);

  readonly notificationsOpen = signal(false);

  readonly notificationCount = this.notificationsService.unreadCount;

  @Input()
  set user(value: TopbarUser | null | undefined) {
    this.inputUser.set(value ?? null);
  }

  @Input() sidebarCollapsed = false;
  @Output() menuClick = new EventEmitter<void>();

  readonly dateLabel = 'Wednesday, 22 April 2026';
  // readonly notificationCount = 3;

  async ngOnInit(): Promise<void> {
    await this.notificationsService.ensureLoaded();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.searchOpen.set(false);
      this.notificationsOpen.set(false);
    }
  }

  toggleNotifications(event: MouseEvent): void {
    event.stopPropagation();

    this.searchOpen.set(false);

    this.notificationsOpen.update((open) => !open);
  }

  closeNotifications(): void {
    this.notificationsOpen.set(false);
  }

  switchLanguage(): void {
    this.translation.toggleLanguage();
  }

  updateSearch(value: string): void {
    this.searchQuery.set(value);
    this.searchOpen.set(true);
  }

  focusSearch(): void {
    this.searchOpen.set(true);
  }

  async chooseSearchResult(result: AdminSearchResult): Promise<void> {
    const query = this.searchQuery().trim();

    this.searchOpen.set(false);
    this.searchQuery.set('');

    await this.router.navigate([result.route], {
      queryParams: result.queryParam ? { q: query } : {},
    });
  }

  async submitSearch(): Promise<void> {
    const [firstResult] = this.searchResults();

    if (firstResult) {
      await this.chooseSearchResult(firstResult);
    }
  }

  resultTypeLabel(type: AdminSearchResult['type']): string {
    switch (type) {
      case 'action':
        return 'Action';
      case 'search':
        return 'Search in page';
      case 'page':
      default:
        return 'Page';
    }
  }

}
