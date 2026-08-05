export type OrderPaymentStatus = 'Paid' | 'Pending' | 'Refunded' | 'Unpaid' | 'Failed';
export type OrderDeliveryStatus = 'Processing' | 'Delivered' | 'Completed' | 'Shipped' | 'Returned' | 'Cancelled' | 'Pending';
export type OrderDateFilter = 'all' | 'today' | 'this_week' | 'this_month';

export interface AdminOrder {
  id: string;
  orderId: string; // order_number from Supabase
  customerName: string;
  customerEmail: string;
  date: string;
  items: number;
  total: string;
  payment: OrderPaymentStatus;
  delivery: OrderDeliveryStatus;
  // Additional fields for modal
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  subtotal?: string;
  shipping?: string;
  notes?: string;
  createdAt?: string;
  supabaseOrderId?: string; // UUID
  customerUserId: string | null;
  loyaltyPoints: number;
  loyaltyProcessed: boolean;
}

export interface OrderStats {
  totalOrders: number;
  processing: number;
  delivered: number;
  refunded: number;
}
