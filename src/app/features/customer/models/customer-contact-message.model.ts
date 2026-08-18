export type CustomerContactMessageStatus = 'new' | 'in_progress' | 'resolved' | 'closed';

export interface CustomerContactMessageInput {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly subject: string;
  readonly message: string;
}

export interface CustomerContactMessageRow {
  readonly id: string;
  readonly customer_user_id: string | null;
  readonly full_name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly subject: string;
  readonly message: string;
  readonly status: CustomerContactMessageStatus;
  readonly created_at: string;
  readonly updated_at: string;
}
