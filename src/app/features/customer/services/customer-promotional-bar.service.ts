import { Injectable, inject } from '@angular/core';

import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { DiscountType } from '../../../data-access';

export interface CustomerPromotionAnnouncement {
  id: string;
  title: string;
  message?: string | null;
  badgeText?: string | null;
  link?: string | null;
  linkText?: string | null;
  icon?: string | null;
  shippingText?: string;
  source: 'promotion' | 'discount';
}

interface PromotionAnnouncementRecord {
  id: string;
  title: string;
  description: string | null;
  badge_text: string | null;
  button_link: string | null;
  button_text: string | null;
  icon: string | null;
}

interface DiscountAnnouncementRecord {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number | string | null;
  minimum_order_amount: number | string | null;
  usage_limit: number | string | null;
  usage_count: number | string | null;
}

const PROMOTION_ANNOUNCEMENT_SELECT = `
  id,
  title,
  description,
  badge_text,
  button_link,
  button_text,
  icon
`;

const DISCOUNT_ANNOUNCEMENT_SELECT = `
  id,
  code,
  discount_type,
  discount_value,
  minimum_order_amount,
  usage_limit,
  usage_count
`;

@Injectable({ providedIn: 'root' })
export class CustomerPromotionalBarService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);

  async getActivePromotionAnnouncements(): Promise<CustomerPromotionAnnouncement[]> {
    const now = new Date().toISOString();
    return this.getActivePromotions(now);
  }

  async getActiveDiscountAnnouncements(): Promise<CustomerPromotionAnnouncement[]> {
    const now = new Date().toISOString();
    return this.getActiveDiscounts(now);
  }

  private async getActivePromotions(now: string): Promise<CustomerPromotionAnnouncement[]> {
    const { data, error } = await this.supabase
      .from('promotions')
      .select(PROMOTION_ANNOUNCEMENT_SELECT)
      .eq('is_active', true)
      .eq('display_type', 'bar')
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Unable to load promotional bar promotions: ${error.message}`);
    }

    return (data ?? []).map((record) => {
      const promotion = record as unknown as PromotionAnnouncementRecord;

      return {
        id: promotion.id,
        title: promotion.title,
        message: promotion.description,
        badgeText: promotion.badge_text,
        link: promotion.button_link,
        linkText: promotion.button_text,
        icon: promotion.icon,
        source: 'promotion',
      };
    });
  }

  private async getActiveDiscounts(now: string): Promise<CustomerPromotionAnnouncement[]> {
    const { data, error } = await this.supabase
      .from('discounts')
      .select(DISCOUNT_ANNOUNCEMENT_SELECT)
      .eq('is_active', true)
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Unable to load promotional bar discounts: ${error.message}`);
    }

    return (data ?? [])
      .map((record) => record as unknown as DiscountAnnouncementRecord)
      .filter((discount) => {
        const usageLimit = this.toNumber(discount.usage_limit);
        return usageLimit === null || (this.toNumber(discount.usage_count) ?? 0) < usageLimit;
      })
      .map((discount) => ({
        id: discount.id,
        title: this.discountAnnouncementText(discount),
        message: null,
        badgeText: discount.code,
        link: null,
        linkText: null,
        icon: this.discountIcon(discount.discount_type),
        shippingText: this.shippingDiscountAnnouncementText(discount),
        source: 'discount' as const,
      }));
  }

  private shippingDiscountAnnouncementText(discount: DiscountAnnouncementRecord): string {
    const code = discount.code.trim().toUpperCase();
    const value = this.toNumber(discount.discount_value) ?? 0;
    const minimumOrder = this.toNumber(discount.minimum_order_amount);
    const minimumOrderText = minimumOrder && minimumOrder > 0
      ? ` ON ORDERS OVER ${this.formatCurrency(minimumOrder)}`
      : '';

    switch (discount.discount_type) {
      case 'percentage':
        return `USE CODE: ${code} FOR ${this.formatNumber(value)}% OFF${minimumOrderText}`;
      case 'fixed_amount':
        return `USE CODE: ${code} FOR ${this.formatCurrency(value)} OFF${minimumOrderText}`;
      case 'free_shipping':
        return `FREE SHIPPING${minimumOrderText} · USE CODE: ${code}`;
    }
  }

  private discountAnnouncementText(discount: DiscountAnnouncementRecord): string {
    const code = discount.code.trim().toUpperCase();
    const value = this.toNumber(discount.discount_value) ?? 0;
    let text: string;

    switch (discount.discount_type) {
      case 'percentage':
        text = `Use code ${code} for ${this.formatNumber(value)}% off`;
        break;
      case 'fixed_amount':
        text = `Use code ${code} for ${this.formatCurrency(value)} off`;
        break;
      case 'free_shipping':
        text = `Free shipping — use code ${code}`;
        break;
    }

    const minimumOrder = this.toNumber(discount.minimum_order_amount);
    return minimumOrder && minimumOrder > 0
      ? `${text} on orders over ${this.formatCurrency(minimumOrder)}`
      : text;
  }

  private discountIcon(discountType: DiscountType): string {
    switch (discountType) {
      case 'percentage':
        return 'pi pi-percentage';
      case 'fixed_amount':
        return 'pi pi-tag';
      case 'free_shipping':
        return 'pi pi-truck';
    }
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  }

  private toNumber(value: number | string | null): number | null {
    if (value === null || value === '') return null;

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
}
