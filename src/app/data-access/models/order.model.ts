export type OrderPaymentStatus = 'Paid' | 'Pending' | 'Refunded';
export type OrderDeliveryStatus = 'Processing' | 'Delivered' | 'Shipped' | 'Returned';
export type OrderDateFilter = 'all' | 'today' | 'this_week' | 'this_month';

export interface AdminOrder {
  id: string;
  customerName: string;
  customerEmail: string;
  date: string;
  items: number;
  total: string;
  payment: OrderPaymentStatus;
  delivery: OrderDeliveryStatus;
}

export interface OrderStats {
  totalOrders: number;
  processing: number;
  delivered: number;
  refunded: number;
}
