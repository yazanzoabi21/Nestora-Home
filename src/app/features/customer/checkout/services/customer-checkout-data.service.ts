import { Injectable, inject } from '@angular/core';

import { CUSTOMER_SUPABASE } from '../../../../core/tokens';
import {
  CheckoutPaymentMethod,
  CheckoutShippingMethod,
  PaymentMethodRow,
  ShippingMethodRow,
} from '../models';

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
export class CustomerCheckoutDataService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);

  async getShippingMethods(subtotal: number): Promise<readonly CheckoutShippingMethod[]> {
    const { data, error } = await this.supabase
      .from('shipping_methods')
      .select(SHIPPING_METHOD_SELECT)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Unable to load shipping methods. ${error.message}`);
    }

    return ((data ?? []) as unknown as ShippingMethodRow[]).map((row) =>
      this.mapShippingMethod(row, subtotal),
    );
  }

  async getPaymentMethods(subtotal: number): Promise<readonly CheckoutPaymentMethod[]> {
    const { data, error } = await this.supabase
      .from('payment_methods')
      .select(PAYMENT_METHOD_SELECT)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Unable to load payment methods. ${error.message}`);
    }

    return ((data ?? []) as unknown as PaymentMethodRow[])
      .map((row) => this.mapPaymentMethod(row, subtotal))
      .filter(
        (method) =>
          (method.minAmount === null || subtotal >= method.minAmount) &&
          (method.maxAmount === null || subtotal <= method.maxAmount),
      );
  }

  private mapShippingMethod(
    row: ShippingMethodRow,
    subtotal: number,
  ): CheckoutShippingMethod {
    const baseCost = this.toNumber(row.base_cost);
    const freeShippingMinAmount = this.toNullableNumber(row.free_shipping_min_amount);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      carrierName: row.carrier_name,
      description: row.description,
      icon: row.icon,
      baseCost,
      freeShippingMinAmount,
      etaMinDays: row.eta_min_days,
      etaMaxDays: row.eta_max_days,
      etaLabel: row.eta_label,
      calculatedCost:
        freeShippingMinAmount !== null && subtotal >= freeShippingMinAmount ? 0 : baseCost,
    };
  }

  private mapPaymentMethod(row: PaymentMethodRow, subtotal: number): CheckoutPaymentMethod {
    const feeFixed = this.toNumber(row.fee_fixed);
    const feePercentage = this.toNumber(row.fee_percentage);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      provider: row.provider,
      type: row.type,
      description: row.description,
      icon: row.icon,
      instructionsEn: row.instructions_en,
      instructionsAr: row.instructions_ar,
      minAmount: this.toNullableNumber(row.min_amount),
      maxAmount: this.toNullableNumber(row.max_amount),
      feeFixed,
      feePercentage,
      calculatedFee: feeFixed + subtotal * (feePercentage / 100),
      config: Object.freeze({ ...(row.config ?? {}) }),
    };
  }

  private toNullableNumber(value: number | string | null): number | null {
    return value === null ? null : this.toNumber(value);
  }

  private toNumber(value: number | string): number {
    const result = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(result)) {
      throw new Error('Checkout configuration contains an invalid numeric value.');
    }
    return result;
  }
}
