export type OrderPaymentStatus =
  | 'Paid'
  | 'Pending'
  | 'Refunded'
  | 'Unpaid'
  | 'Failed';

export type OrderDeliveryStatus =
  | 'Processing'
  | 'Delivered'
  | 'Completed'
  | 'Shipped'
  | 'Returned'
  | 'Cancelled'
  | 'Pending';

export type OrderDateFilter =
  | 'all'
  | 'today'
  | 'this_week'
  | 'this_month';

export interface AdminOrderItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  variantName: string | null;
  variantAttributes: Readonly<Record<string, string>>;

  /**
   * Snapshot name saved in order_items at checkout.
   * We keep this instead of relying on the current product name.
   */
  name: string;

  /**
   * Current product metadata used only for display.
   */
  sku: string | null;
  imageUrl: string | null;

  quantity: number;
  unitPrice: number;
  total: number;

  loyaltyRedeemed: boolean;
  loyaltyPointsCost: number;
  loyaltyPointsEarned: number;
}

export interface AdminOrder {
  id: string;

  /**
   * Human-readable order number.
   */
  orderId: string;

  /**
   * Real orders.id UUID from Supabase.
   */
  supabaseOrderId?: string;

  customerUserId: string | null;

  customerName: string;
  customerEmail: string;
  phone?: string;

  date: string;
  createdAt?: string;

  /**
   * Total quantity of units in this order.
   * Used by the Admin table.
   */
  items: number;

  /**
   * Full invoice item information.
   */
  orderItems: AdminOrderItem[];

  subtotal?: string;
  discount?: string;
  shipping?: string;
  total: string;

  payment: OrderPaymentStatus;
  delivery: OrderDeliveryStatus;

  address?: string;
  city?: string;
  country?: string;
  notes?: string;

  loyaltyPoints: number;
  loyaltyProcessed: boolean;
}

export interface OrderStats {
  totalOrders: number;
  processing: number;
  delivered: number;
  refunded: number;
}
