import { FormControl } from '@angular/forms';

import { CustomerCartLine } from '../models';

export type CheckoutStep = 'shipping' | 'delivery' | 'payment' | 'confirmed';

export interface ShippingInformation {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface DeliveryOption {
  id: string;
  methodId: string;
  methodZoneId: string | null;
  name: string;
  code: string | null;
  description: string | null;
  icon: string;
  eta: string;
  fee: number;
  freeOver: number | null;
}

export interface PaymentInformation {
  methodId: string;
  reference: string;
}

export interface CheckoutOrderItem {
  productId: string;
  name: string;
  imageUrl: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CheckoutTotals {
  subtotal: number;
  discount: number;
  delivery: number;
  paymentFee: number;
  total: number;
}

export interface CheckoutConfirmation {
  orderId: string;
  orderNumber: string;
  customerName: string;
  paymentStatus: string;
  paymentMethodName: string;
  totals: CheckoutTotals;
  lines: CustomerCartLine[];
}

export interface CheckoutSelectOption {
  label: string;
  value: string;
}

export type CheckoutTextControl = FormControl<string>;
