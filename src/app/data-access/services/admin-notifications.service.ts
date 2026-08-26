import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase';
import { AdminNotification, AdminNotificationId } from '../../data-access/models/admin-notification.model';

type NotificationRecord = Record<string, unknown>;

@Injectable({
  providedIn: 'root',
})
export class AdminNotificationsService {
  private readonly supabase = inject(SupabaseService).client;
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  readonly notifications = signal<AdminNotification[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly unreadCount = computed(
    () => this.notifications().filter((notification) => !notification.isRead).length,
  );
  readonly previewNotifications = computed(() => this.notifications().slice(0, 5));

  async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this.refresh().finally(() => {
      this.loadPromise = null;
    });

    return this.loadPromise;
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabase
        .from('notifications')
        .select('*');

      if (error) {
        throw error;
      }

      const notifications = (data ?? [])
        .map((row) => this.mapNotification(row as NotificationRecord))
        .filter((notification): notification is AdminNotification => notification !== null)
        .sort((first, second) => this.toTimestamp(second.createdAt) - this.toTimestamp(first.createdAt));

      this.notifications.set(notifications);
      this.loaded = true;
    } catch (error) {

      this.error.set('Unable to load notifications.');
    } finally {
      this.loading.set(false);
    }
  }

  async markAsRead(id: AdminNotificationId): Promise<boolean> {
    const current = this.notifications().find((notification) => notification.id === id);
    if (!current || current.isRead) {
      return true;
    }

    const { error } = await this.supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (error) {

      this.error.set('Unable to update the notification.');
      return false;
    }

    this.notifications.update((notifications) =>
      notifications.map((notification) =>
        notification.id === id
          ? { ...notification, isRead: true }
          : notification,
      ),
    );

    return true;
  }

  async markAllAsRead(): Promise<boolean> {
    if (this.unreadCount() === 0) {
      return true;
    }

    const { error } = await this.supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false);

    if (error) {

      this.error.set('Unable to update notifications.');
      return false;
    }

    this.notifications.update((notifications) =>
      notifications.map((notification) => ({ ...notification, isRead: true })),
    );

    return true;
  }

  private mapNotification(record: NotificationRecord): AdminNotification | null {
    const id = this.readId(record['id']);
    if (id === null) {
      return null;
    }

    const data = this.readRecord(record['data']);
    const rawMessage = this.firstString(
      record['body'],
      record['message'],
      record['description'],
      record['text'],
    );
    const title = this.firstString(
      record['title'],
      record['subject'],
      rawMessage,
      'Notification',
    ) ?? 'Notification';
    const message = rawMessage && rawMessage !== title ? rawMessage : null;

    return {
      id,
      title,
      message,

      type: this.firstString(
        record['notification_type'],
        record['type'],
        record['category'],
        'info',
      ) ?? 'info',

      isRead: record['is_read'] === true,

      createdAt: this.firstString(
        record['created_at'],
      ),

      actionUrl: this.firstString(
        record['action_url'],
      ),

      entityType: this.firstString(
        record['entity_type'],
      ),

      entityId: this.firstString(
        record['entity_id'],
      ),
    };
  }

  private readId(value: unknown): AdminNotificationId | null {
    return typeof value === 'string' || typeof value === 'number' ? value : null;
  }

  private readRecord(value: unknown): NotificationRecord | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as NotificationRecord)
      : null;
  }

  private firstString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private toTimestamp(value: string | null): number {
    if (!value) {
      return 0;
    }

    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }
}
