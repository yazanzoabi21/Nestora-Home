import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AdminSidebarBadgesService } from '../../../core/services/navigation';
import { TranslationService } from '../../../core/services/translation';

import { AdminNotification } from '../../../data-access/models/admin-notification.model';
import { AdminNotificationsService } from '../../../data-access/services/admin-notifications.service';

import {
  AdminPaginationComponent,
  PaginationPageSize,
} from '../../../shared/ui/admin-pagination';

type NotificationFilter = 'all' | 'unread' | 'read';

@Component({
  selector: 'app-admin-notifications',
  standalone: true,
  imports: [
    TranslatePipe,
    AdminPaginationComponent,
  ],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent implements OnInit {
  private readonly notificationsService = inject(
    AdminNotificationsService,
  );

  private readonly sidebarBadges = inject(
    AdminSidebarBadgesService,
  );

  private readonly router = inject(Router);
  private readonly translation = inject(TranslationService);

  readonly notifications =
    this.notificationsService.notifications;

  readonly unreadCount =
    this.notificationsService.unreadCount;

  readonly loading =
    this.notificationsService.loading;

  readonly error =
    this.notificationsService.error;

  readonly searchTerm = signal('');

  readonly selectedFilter =
    signal<NotificationFilter>('all');

  readonly currentPage = signal(1);

  readonly pageSize =
    signal<PaginationPageSize>(12);

  readonly totalCount = computed(
    () => this.notifications().length,
  );

  readonly readCount = computed(
    () => this.totalCount() - this.unreadCount(),
  );

  readonly todayCount = computed(() =>
    this.notifications().filter((notification) =>
      this.isToday(notification.createdAt),
    ).length,
  );

  readonly filteredNotifications = computed(() => {
    const query = this.searchTerm()
      .trim()
      .toLocaleLowerCase();

    const filter = this.selectedFilter();

    return this.notifications().filter((notification) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'unread' && !notification.isRead) ||
        (filter === 'read' && notification.isRead);

      if (!matchesFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return `${notification.title} ${notification.message ?? ''} ${notification.type}`
        .toLocaleLowerCase()
        .includes(query);
    });
  });

  readonly visibleNotifications = computed(() => {
    const notifications =
      this.filteredNotifications();

    const size = this.pageSize();

    if (size === 'all') {
      return notifications;
    }

    const totalPages = Math.max(
      1,
      Math.ceil(notifications.length / size),
    );

    const page = Math.min(
      this.currentPage(),
      totalPages,
    );

    const start = (page - 1) * size;

    return notifications.slice(
      start,
      start + size,
    );
  });

  async ngOnInit(): Promise<void> {
    await this.notificationsService.ensureLoaded();
  }

  setSearch(value: string): void {
    this.searchTerm.set(value);
    this.currentPage.set(1);
  }

  setFilter(filter: NotificationFilter): void {
    this.selectedFilter.set(filter);
    this.currentPage.set(1);
  }

  setPage(page: number): void {
    this.currentPage.set(page);
  }

  setPageSize(size: PaginationPageSize): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  async refresh(): Promise<void> {
    await this.notificationsService.refresh();

    await this.sidebarBadges.refreshBadge(
      'notifications.unread',
    );
  }

  async markAllAsRead(): Promise<void> {
    const updated =
      await this.notificationsService.markAllAsRead();

    if (!updated) {
      return;
    }

    this.currentPage.set(1);

    await this.sidebarBadges.refreshBadge(
      'notifications.unread',
    );
  }

  async selectNotification(
    notification: AdminNotification,
  ): Promise<void> {
    if (!notification.isRead) {
      const updated =
        await this.notificationsService.markAsRead(
          notification.id,
        );

      if (updated) {
        await this.sidebarBadges.refreshBadge(
          'notifications.unread',
        );
      }
    }

    if (!notification.actionUrl) {
      return;
    }

    if (/^https?:\/\//i.test(notification.actionUrl)) {
      window.open(
        notification.actionUrl,
        '_blank',
        'noopener,noreferrer',
      );

      return;
    }

    await this.router.navigateByUrl(
      notification.actionUrl,
    );
  }

  relativeTime(
    createdAt: string | null,
  ): string {
    if (!createdAt) {
      return '';
    }

    const timestamp =
      new Date(createdAt).getTime();

    if (Number.isNaN(timestamp)) {
      return '';
    }

    const elapsedSeconds = Math.max(
      0,
      Math.floor(
        (Date.now() - timestamp) / 1000,
      ),
    );

    const formatter =
      new Intl.RelativeTimeFormat(
        this.translation.currentLang(),
        {
          numeric: 'auto',
        },
      );

    if (elapsedSeconds < 60) {
      return formatter.format(
        -elapsedSeconds,
        'second',
      );
    }

    const minutes =
      Math.floor(elapsedSeconds / 60);

    if (minutes < 60) {
      return formatter.format(
        -minutes,
        'minute',
      );
    }

    const hours =
      Math.floor(minutes / 60);

    if (hours < 24) {
      return formatter.format(
        -hours,
        'hour',
      );
    }

    const days =
      Math.floor(hours / 24);

    if (days < 30) {
      return formatter.format(
        -days,
        'day',
      );
    }

    return new Intl.DateTimeFormat(
      this.translation.currentLang(),
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      },
    ).format(timestamp);
  }

  private isToday(
    createdAt: string | null,
  ): boolean {
    if (!createdAt) {
      return false;
    }

    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
      return false;
    }

    const today = new Date();

    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }
}