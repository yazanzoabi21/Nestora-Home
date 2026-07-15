import { Injectable, inject } from '@angular/core';

import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { PaymentMethod, ShippingMethod, ShippingMethodZone } from '../../../data-access';

const SHIPPING_METHOD_SELECT = `
  id,
  name,
  code,
  carrier_name,
  description,
  icon,
  base_cost,
  free_shipping_min_amount,
  eta_min_days,
  eta_max_days,
  eta_label,
  is_active,
  sort_order,
  created_at,
  updated_at
`;

const DELIVERY_ZONE_SELECT = `
  id,
  name,
  country,
  cities,
  areas,
  extra_cost,
  is_active,
  created_at,
  updated_at
`;

const SHIPPING_METHOD_ZONE_SELECT = `
  id,
  shipping_method_id,
  delivery_zone_id,
  cost_override,
  free_shipping_min_amount_override,
  eta_min_days_override,
  eta_max_days_override,
  eta_label_override,
  is_active,
  created_at,
  updated_at,
  shipping_method:shipping_method_id (
    ${SHIPPING_METHOD_SELECT}
  ),
  delivery_zone:delivery_zone_id (
    ${DELIVERY_ZONE_SELECT}
  )
`;

const PAYMENT_METHOD_SELECT = `
  id,
  code,
  name,
  provider,
  type,
  description,
  icon,
  instructions_en,
  instructions_ar,
  is_active,
  sort_order,
  min_amount,
  max_amount,
  fee_fixed,
  fee_percentage,
  config,
  created_at,
  updated_at
`;

@Injectable({ providedIn: 'root' })
export class CustomerCheckoutOptionsService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);

  async getShippingMethods(): Promise<ShippingMethod[]> {
    const { data, error } = await this.supabase
      .from('shipping_methods')
      .select(SHIPPING_METHOD_SELECT)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Unable to load shipping methods. ${error.message}`);
    return (data ?? []) as unknown as ShippingMethod[];
  }

  async getShippingMethodZones(): Promise<ShippingMethodZone[]> {
    const { data, error } = await this.supabase
      .from('shipping_method_zones')
      .select(SHIPPING_METHOD_ZONE_SELECT)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Unable to load shipping method zones. ${error.message}`);
    return (data ?? []) as unknown as ShippingMethodZone[];
  }

  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const { data, error } = await this.supabase
      .from('payment_methods')
      .select(PAYMENT_METHOD_SELECT)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Unable to load payment methods. ${error.message}`);
    return (data ?? []) as unknown as PaymentMethod[];
  }
}
