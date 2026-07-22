export interface CustomerOrderItem {
  id: string;
  productId: string;
  productName: string | null;
  productSlug: string | null;
  productImageUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CustomerOrder {
  id: string;
  userId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  shipping: number;
  paymentFee: number;
  discountAmount: number;
  total: number;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string | null;
  shippingMethodId: string | null;
  paymentMethodId: string | null;
  discountCode: string | null;
  items: readonly CustomerOrderItem[];
}
