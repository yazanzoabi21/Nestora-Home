export type CheckoutStep = 'shipping' | 'delivery' | 'payment' | 'confirmation';

export interface CheckoutShippingInformation {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  streetAddress: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string;
  postalCode: string | null;
  country: string;
  deliveryInstructions: string | null;
}

export interface CheckoutShippingPrefill {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  streetAddress?: string;
  addressLine2?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  country?: string;
  deliveryInstructions?: string;
}

export interface CheckoutShippingMethod {
  id: string;
  code: string;
  name: string;
  carrierName: string | null;
  description: string | null;
  icon: string | null;
  baseCost: number;
  freeShippingMinAmount: number | null;
  etaMinDays: number | null;
  etaMaxDays: number | null;
  etaLabel: string | null;
  calculatedCost: number;
}

export type CheckoutPaymentMethodType = 'manual' | 'online' | 'bank_transfer' | 'wallet';

export interface CheckoutPaymentMethod {
  id: string;
  code: string;
  name: string;
  provider: string | null;
  type: CheckoutPaymentMethodType;
  description: string | null;
  icon: string | null;
  instructionsEn: string | null;
  instructionsAr: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  feeFixed: number;
  feePercentage: number;
  calculatedFee: number;
  config: Readonly<Record<string, unknown>>;
}

export interface CheckoutSelection {
  shippingInformation: CheckoutShippingInformation | null;
  shippingMethod: CheckoutShippingMethod | null;
  paymentMethod: CheckoutPaymentMethod | null;
}

export interface CheckoutOrderItem {
  productId: string;
  productName: string;
  productImageUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  redeemWithPoints: boolean;
  loyaltyPointsCost: number;
}

export interface CheckoutTotals {
  subtotal: number;
  shippingCost: number;
  paymentFee: number;
  discountAmount: number;
  discountCode: string | null;
  total: number;
}

export interface PlacedOrderResult {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  shippingCost: number;
  paymentFee: number;
  discountAmount: number;
  discountCode: string | null;
  discountId: string | null;
  total: number;
  loyaltyPointsRedeemed: number;
  loyaltyPointsEarned: number;
}

export interface CheckoutConfirmation {
  order: PlacedOrderResult;
  customerName: string;
  paymentMethodName: string;
  items: readonly CheckoutOrderItem[];
  totals: CheckoutTotals;
}

export interface CheckoutSelectOption {
  label: string;
  value: string;
}
