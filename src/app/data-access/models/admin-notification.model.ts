export type AdminNotificationId = string | number;

export interface AdminNotification {
  id: AdminNotificationId;

  title: string;
  message: string | null;

  type: string;

  isRead: boolean;
  createdAt: string | null;

  actionUrl: string | null;

  entityType: string | null;
  entityId: string | null;
}