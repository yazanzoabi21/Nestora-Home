export interface CustomerOrderItem {
  id: string;
  productId: string;
  productName: string | null;
  productSlug: string | null;
  productImageUrl: string | null;
  variantId: string | null;
  variantName: string | null;
  variantSku: string | null;
  variantAttributes: Readonly<Record<string, string>>;
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
  loyaltyPointsEarned: number;
  loyaltyCheckoutProcessed: boolean;
  items: readonly CustomerOrderItem[];
}
