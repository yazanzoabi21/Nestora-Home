import { Injectable, inject } from '@angular/core';

import { ADMIN_SUPABASE, CUSTOMER_SUPABASE } from '../../core/tokens';
import {
  CustomerOffer,
  CustomerOfferDiscount,
  CustomerOfferMutationPayload,
  CustomerOfferStatus,
} from '../models';

interface CustomerOfferDatabaseRow extends Omit<CustomerOffer, 'discount'> {
  discounts?: CustomerOfferDiscount | CustomerOfferDiscount[] | null;
}

const CUSTOMER_OFFER_SELECT = `
  id,
  slug,
  discount_id,
  offer_type,
  audience,
  icon,
  title_en,
  title_ar,
  description_en,
  description_ar,
  badge_en,
  badge_ar,
  action_text_en,
  action_text_ar,
  action_link,
  background_color,
  button_color,
  show_discount_code,
  sort_order,
  is_active,
  start_date,
  end_date,
  created_at,
  updated_at,
  discounts (
    id,
    code,
    discount_type,
    discount_value,
    is_active
  )
`;

@Injectable({ providedIn: 'root' })
export class CustomerOffersService {
  private readonly adminSupabase = inject(ADMIN_SUPABASE);
  private readonly customerSupabase = inject(CUSTOMER_SUPABASE);

  async getCustomerOffersForAdmin(): Promise<CustomerOffer[]> {
    const { data, error } = await this.adminSupabase
      .from('customer_offers')
      .select(CUSTOMER_OFFER_SELECT)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return this.mapOffers(data);
  }

  async getActiveCustomerOffers(): Promise<CustomerOffer[]> {
    const now = new Date().toISOString();
    const { data, error } = await this.customerSupabase
      .from('customer_offers')
      .select(CUSTOMER_OFFER_SELECT)
      .eq('is_active', true)
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(error.message);
    return this.mapOffers(data);
  }

  async createCustomerOffer(payload: CustomerOfferMutationPayload): Promise<CustomerOffer> {
    const { data, error } = await this.adminSupabase
      .from('customer_offers')
      .insert(this.normalizePayload(payload))
      .select(CUSTOMER_OFFER_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return this.mapOffer(data as unknown as CustomerOfferDatabaseRow);
  }

  async updateCustomerOffer(
    id: string,
    payload: CustomerOfferMutationPayload,
  ): Promise<CustomerOffer> {
    const { data, error } = await this.adminSupabase
      .from('customer_offers')
      .update(this.normalizePayload(payload))
      .eq('id', id)
      .select(CUSTOMER_OFFER_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return this.mapOffer(data as unknown as CustomerOfferDatabaseRow);
  }

  async deleteCustomerOffer(id: string): Promise<void> {
    const { error } = await this.adminSupabase.from('customer_offers').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async toggleCustomerOfferStatus(id: string, isActive: boolean): Promise<CustomerOffer> {
    const { data, error } = await this.adminSupabase
      .from('customer_offers')
      .update({ is_active: isActive })
      .eq('id', id)
      .select(CUSTOMER_OFFER_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return this.mapOffer(data as unknown as CustomerOfferDatabaseRow);
  }

  getCustomerOfferStatus(offer: CustomerOffer, now = new Date()): CustomerOfferStatus {
    if (!offer.is_active) return 'inactive';

    const startDate = this.parseDate(offer.start_date);
    const endDate = this.parseDate(offer.end_date);
    if (startDate && startDate > now) return 'scheduled';
    if (endDate && endDate < now) return 'inactive';
    return 'active';
  }

  getVisibleCustomerOffers(
    offers: readonly CustomerOffer[],
    now = new Date(),
  ): CustomerOffer[] {
    return offers
      .filter((offer) => this.getCustomerOfferStatus(offer, now) === 'active')
      .sort((first, second) => first.sort_order - second.sort_order);
  }

  private mapOffers(data: unknown): CustomerOffer[] {
    const rows = Array.isArray(data) ? (data as unknown as CustomerOfferDatabaseRow[]) : [];
    return rows.map((row) => this.mapOffer(row));
  }

  private mapOffer(row: CustomerOfferDatabaseRow): CustomerOffer {
    const relation = Array.isArray(row.discounts)
      ? (row.discounts[0] ?? null)
      : (row.discounts ?? null);

    return {
      id: row.id,
      slug: row.slug.trim(),
      discount_id: row.discount_id ?? null,
      offer_type: row.offer_type,
      audience: row.audience,
      icon: row.icon?.trim() || null,
      title_en: row.title_en.trim(),
      title_ar: row.title_ar.trim(),
      description_en: row.description_en?.trim() || null,
      description_ar: row.description_ar?.trim() || null,
      badge_en: row.badge_en?.trim() || null,
      badge_ar: row.badge_ar?.trim() || null,
      action_text_en: row.action_text_en?.trim() || null,
      action_text_ar: row.action_text_ar?.trim() || null,
      action_link: row.action_link?.trim() || null,
      background_color: row.background_color?.trim() || '#eef4e9',
      button_color: row.button_color?.trim() || '#526148',
      show_discount_code: row.show_discount_code === true,
      sort_order: Math.max(0, Number(row.sort_order ?? 0)),
      is_active: row.is_active === true,
      start_date: row.start_date ?? null,
      end_date: row.end_date ?? null,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
      discount: relation
        ? {
            ...relation,
            code: relation.code.trim().toUpperCase(),
            discount_value:
              relation.discount_value === null ? null : Number(relation.discount_value),
            is_active: relation.is_active !== false,
          }
        : null,
    };
  }

  private normalizePayload(payload: CustomerOfferMutationPayload): CustomerOfferMutationPayload {
    return {
      ...payload,
      slug: payload.slug.trim().toLowerCase(),
      icon: payload.icon?.trim() || null,
      title_en: payload.title_en.trim(),
      title_ar: payload.title_ar.trim(),
      description_en: payload.description_en?.trim() || null,
      description_ar: payload.description_ar?.trim() || null,
      badge_en: payload.badge_en?.trim() || null,
      badge_ar: payload.badge_ar?.trim() || null,
      action_text_en: payload.action_text_en?.trim() || null,
      action_text_ar: payload.action_text_ar?.trim() || null,
      action_link: payload.action_link?.trim() || null,
      background_color: payload.background_color.trim(),
      button_color: payload.button_color.trim(),
      sort_order: Math.max(0, Math.trunc(Number(payload.sort_order) || 0)),
      is_active: payload.is_active === true,
      discount_id: payload.offer_type === 'discount' ? payload.discount_id : null,
      show_discount_code: payload.offer_type === 'discount' && payload.show_discount_code === true,
      start_date: payload.start_date || null,
      end_date: payload.end_date || null,
    };
  }

  private parseDate(value: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
