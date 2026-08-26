import { Injectable, inject } from '@angular/core';

import { CustomerAuthService } from '../../core/services/auth';
import { SupabaseService } from '../../core/services/supabase';
import { CUSTOMER_SUPABASE } from '../../core/tokens';
import {
  Discount,
  DiscountGiftProduct,
  DiscountMutationPayload,
  DiscountStats,
  DiscountStatus,
} from '../models';

const DISCOUNT_SELECT = `
  id,
  name,
  code,
  discount_type,
  discount_value,
  minimum_order_amount,
  gift_quantity,
  applies_to,
  product_id,
  category_id,
  usage_limit,
  usage_count,
  usage_per_customer,
  is_active,
  start_date,
  end_date,
  created_at,
  updated_at,
  products(name),
  categories(name)
`;

@Injectable({
  providedIn: 'root',
})
export class DiscountsService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly customerSupabase = inject(CUSTOMER_SUPABASE);
  private readonly customerAuth = inject(CustomerAuthService);

  async getDiscounts(): Promise<Discount[]> {
    const { data, error } = await this.supabase
      .from('discounts')
      .select(DISCOUNT_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((discount) => this.mapDiscount(discount as unknown as Discount));
  }

  async getDiscountById(id: string): Promise<Discount | null> {
    const { data, error } = await this.supabase
      .from('discounts')
      .select(DISCOUNT_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data ? this.mapDiscount(data as unknown as Discount) : null;
  }

  async createDiscount(payload: DiscountMutationPayload): Promise<Discount> {
    const { data, error } = await this.supabase
      .from('discounts')
      .insert(this.toDiscountRecord(payload))
      .select(DISCOUNT_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapDiscount(data as unknown as Discount);
  }

  async getGiftProductsForDiscount(discountId: string): Promise<DiscountGiftProduct[]> {
    const { data, error } = await this.supabase
      .from('discount_gift_products')
      .select('id,discount_id,product_id,sort_order,is_active,products:product_id(*)')
      .eq('discount_id', discountId)
      .eq('is_active', true)
      .order('sort_order');

    if (error) throw new Error(error.message);

    return (data ?? []).flatMap((value) => {
      const row = value as unknown as {
        id: string;
        discount_id: string;
        product_id: string;
        sort_order: number;
        is_active: boolean;
        products: import('../models').Product | import('../models').Product[] | null;
      };
      const product = Array.isArray(row.products) ? row.products[0] : row.products;
      return product
        ? [{
          id: row.id,
          discountId: row.discount_id,
          productId: row.product_id,
          sortOrder: Number(row.sort_order),
          isActive: row.is_active !== false,
          product,
        }]
        : [];
    });
  }

  async setGiftProductsForDiscount(
    discountId: string,
    productIds: readonly string[],
  ): Promise<void> {
    const { error } = await this.supabase.rpc('replace_discount_gift_products', {
      p_discount_id: discountId,
      p_product_ids: [...new Set(productIds)],
    });
    if (error) throw new Error(error.message);
  }

  async updateDiscount(id: string, payload: Partial<DiscountMutationPayload>): Promise<Discount> {
    const { data, error } = await this.supabase
      .from('discounts')
      .update(this.toDiscountRecord(payload))
      .eq('id', id)
      .select(DISCOUNT_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapDiscount(data as unknown as Discount);
  }

  async deleteDiscount(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('discounts')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  async getDiscountStats(): Promise<DiscountStats> {
    return this.getStatsFromDiscounts(await this.getDiscounts());
  }

  getStatsFromDiscounts(discounts: Discount[]): DiscountStats {
    const stats = discounts.reduce<DiscountStats>(
      (result, discount) => {
        const status = this.getDiscountStatus(discount);

        result.totalDiscounts += 1;
        result.activeDiscounts += status === 'active' ? 1 : 0;
        result.scheduledDiscounts += status === 'scheduled' ? 1 : 0;
        result.expiredDiscounts += status === 'expired' ? 1 : 0;
        result.pausedDiscounts += status === 'paused' ? 1 : 0;
        result.totalUsage += discount.usage_count ?? 0;

        return result;
      },
      {
        totalDiscounts: 0,
        activeDiscounts: 0,
        scheduledDiscounts: 0,
        expiredDiscounts: 0,
        pausedDiscounts: 0,
        totalUsage: 0,
        averageUsage: 0,
      }
    );

    return {
      ...stats,
      averageUsage: stats.totalDiscounts ? Math.round(stats.totalUsage / stats.totalDiscounts) : 0,
    };
  }

  getDiscountStatus(discount: Discount, now = new Date()): DiscountStatus {
    if (discount.is_active === false) {
      return 'paused';
    }

    const startDate = this.parseDate(discount.start_date);
    const endDate = this.parseDate(discount.end_date);

    if (startDate && startDate > now) {
      return 'scheduled';
    }

    if (endDate && endDate < now) {
      return 'expired';
    }

    return 'active';
  }

  private mapDiscount(discount: Discount): Discount {
    return {
      ...discount,
      name: discount.name.trim(),
      code: discount.code.trim().toUpperCase(),
      discount_value: this.toNumberOrNull(discount.discount_value),
      minimum_order_amount: this.toNumberOrNull(discount.minimum_order_amount),
      gift_quantity: Math.max(1, Math.trunc(Number(discount.gift_quantity ?? 1))),
      product_id: discount.product_id ?? null,
      category_id: discount.category_id ?? null,
      usage_limit: this.toNumberOrNull(discount.usage_limit),
      usage_count: Number(discount.usage_count ?? 0),
      usage_per_customer: this.toNumberOrNull(discount.usage_per_customer),
      is_active: discount.is_active !== false,
      start_date: discount.start_date ?? null,
      end_date: discount.end_date ?? null,
      created_at: discount.created_at ?? null,
      updated_at: discount.updated_at ?? null,
      products: this.resolveRelation(discount.products),
      categories: this.resolveRelation(discount.categories),
    };
  }

  private toDiscountRecord(payload: Partial<DiscountMutationPayload>): Partial<DiscountMutationPayload> {
    const record: Partial<DiscountMutationPayload> = {};

    if (payload.name !== undefined) {
      record.name = payload.name.trim();
    }

    if (payload.code !== undefined) {
      record.code = payload.code.trim().toUpperCase();
    }

    if (payload.discount_type !== undefined) {
      record.discount_type = payload.discount_type;
    }

    if (payload.discount_value !== undefined) {
      record.discount_value = this.toNumberOrNull(payload.discount_value);
    }

    if (payload.minimum_order_amount !== undefined) {
      record.minimum_order_amount = this.toNumberOrNull(payload.minimum_order_amount) ?? 0;
    }

    if (payload.gift_quantity !== undefined) {
      record.gift_quantity = Math.max(1, Math.trunc(Number(payload.gift_quantity)));
    }

    if (payload.applies_to !== undefined) {
      record.applies_to = payload.applies_to;
    }

    if (payload.product_id !== undefined) {
      record.product_id = payload.product_id;
    }

    if (payload.category_id !== undefined) {
      record.category_id = payload.category_id;
    }

    if (payload.usage_limit !== undefined) {
      record.usage_limit = this.toNumberOrNull(payload.usage_limit);
    }

    if (payload.usage_count !== undefined) {
      record.usage_count = Number(payload.usage_count ?? 0);
    }

    if (payload.usage_per_customer !== undefined) {
      record.usage_per_customer = this.toNumberOrNull(payload.usage_per_customer);
    }

    if (payload.is_active !== undefined) {
      record.is_active = payload.is_active;
    }

    if (payload.start_date !== undefined) {
      record.start_date = payload.start_date || null;
    }

    if (payload.end_date !== undefined) {
      record.end_date = payload.end_date || null;
    }

    return record;
  }

  private resolveRelation<T>(value: T | T[] | null | undefined): T | null {
    return Array.isArray(value) ? value[0] ?? null : value ?? null;
  }

  private toNumberOrNull(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numericValue = Number(value);
    return Number.isNaN(numericValue) ? null : numericValue;
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  async getAutomaticFreeGiftDiscount(): Promise<Discount | null> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('discounts')
      .select(DISCOUNT_SELECT)
      .eq('discount_type', 'free_gift')
      .eq('is_active', true)
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Unable to load free gift discount: ${error.message}`,
      );
    }

    return data ? this.mapDiscount(data as unknown as Discount) : null;
  }

  async getDiscountByCode(code: string): Promise<Discount | null> {
    const normalizedCode = code.trim().toUpperCase();

    if (!normalizedCode) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('discounts')
      .select(DISCOUNT_SELECT)
      .eq('code', normalizedCode)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data ? this.mapDiscount(data as unknown as Discount) : null;
  }

  isDiscountAvailable(discount: Discount): boolean {
    const usageLimitReached =
      discount.usage_limit !== null &&
      discount.usage_count >= discount.usage_limit;

    return (
      this.getDiscountStatus(discount) === 'active' &&
      !usageLimitReached
    );
  }

  async canCurrentCustomerUseDiscount(
    discount: Discount,
  ): Promise<boolean> {
    if (discount.usage_per_customer == null) {
      return true;
    }

    const customerId = await this.customerAuth.getCurrentUserId();
    if (!customerId) {
      return false;
    }

    const { data, error } = await this.customerSupabase.rpc(
      'can_current_customer_use_discount',
      {
        p_discount_id: discount.id,
      },
    );

    if (error) {
      throw new Error(
        `Unable to validate promo usage: ${error.message}`,
      );
    }

    return data === true;
  }
}
