import { CheckoutPaymentMethodType } from './checkout.models';

export interface ShippingMethodRow {
  id: string;
  name: string;
  code: string;
  carrier_name: string | null;
  description: string | null;
  icon: string | null;
  base_cost: number | string;
  eta_min_days: number | null;
  eta_max_days: number | null;
  eta_label: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethodRow {
  id: string;
  code: string;
  name: string;
  provider: string | null;
  type: CheckoutPaymentMethodType;
  description: string | null;
  icon: string | null;
  instructions_en: string | null;
  instructions_ar: string | null;
  is_active: boolean;
  sort_order: number;
  min_amount: number | string | null;
  max_amount: number | string | null;
  fee_fixed: number | string;
  fee_percentage: number | string;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface OrderShippingAddressInsert {
  order_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  street_address: string;
  address_line_2: string | null;
  city: string;
  state_province: string;
  postal_code: string | null;
  country: string;
  delivery_instructions: string | null;
}
