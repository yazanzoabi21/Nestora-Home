import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AdminSidebarBadgesService } from '../../../core/services/navigation';
import { TranslationService } from '../../../core/services/translation';

import { AdminNotification } from '../../../data-access/models/admin-notification.model';
import { AdminNotificationsService } from '../../../data-access/services/admin-notifications.service';

@Component({
  selector: 'app-admin-notifications-popover',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './admin-notifications-popover.component.html',
  styleUrl: './admin-notifications-popover.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminNotificationsPopoverComponent {
  private readonly notificationsService = inject(AdminNotificationsService);
  private readonly sidebarBadges = inject(AdminSidebarBadgesService);
  private readonly router = inject(Router);
  private readonly translation = inject(TranslationService);

  private readonly openState = signal(false);

  readonly notifications = this.notificationsService.previewNotifications;
  readonly unreadCount = this.notificationsService.unreadCount;
  readonly loading = this.notificationsService.loading;
  readonly error = this.notificationsService.error;

  @Input()
  set open(value: boolean) {
    this.openState.set(value);

    if (value) {
      void this.notificationsService.refresh();
    }
  }

  get open(): boolean {
    return this.openState();
  }

  @Output() readonly closed = new EventEmitter<void>();

  async selectNotification(
    notification: AdminNotification,
  ): Promise<void> {
    if (!notification.isRead) {
      const updated = await this.notificationsService.markAsRead(
        notification.id,
      );

      if (updated) {
        await this.sidebarBadges.refreshBadge('notifications.unread');
      }
    }

    this.closed.emit();

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

    await this.router.navigateByUrl(notification.actionUrl);
  }

  async viewAll(): Promise<void> {
    this.closed.emit();
    await this.router.navigate(['/admin/notifications']);
  }

  relativeTime(createdAt: string | null): string {
    if (!createdAt) {
      return '';
    }

    const timestamp = new Date(createdAt).getTime();

    if (Number.isNaN(timestamp)) {
      return '';
    }

    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - timestamp) / 1000),
    );

    const formatter = new Intl.RelativeTimeFormat(
      this.translation.currentLang(),
      {
        numeric: 'auto',
      },
    );

    if (elapsedSeconds < 60) {
      return formatter.format(-elapsedSeconds, 'second');
    }

    const minutes = Math.floor(elapsedSeconds / 60);

    if (minutes < 60) {
      return formatter.format(-minutes, 'minute');
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
      return formatter.format(-hours, 'hour');
    }

    const days = Math.floor(hours / 24);

    if (days < 30) {
      return formatter.format(-days, 'day');
    }

    const currentYear = new Date().getFullYear();
    const notificationYear = new Date(timestamp).getFullYear();

    return new Intl.DateTimeFormat(
      this.translation.currentLang(),
      {
        day: 'numeric',
        month: 'short',
        year:
          notificationYear !== currentYear
            ? 'numeric'
            : undefined,
      },
    ).format(timestamp);
  }
}