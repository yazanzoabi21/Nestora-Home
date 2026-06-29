import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../core/services/supabase';
import {
  Promotion,
  PromotionMutationPayload,
  PromotionStats,
  PromotionStatus,
} from '../models';

const PROMOTION_SELECT = `
  id,
  title,
  description,
  image_url,
  button_text,
  button_link,
  placement,
  background_color,
  text_color,
  is_active,
  start_date,
  end_date,
  created_at
`;

@Injectable({
  providedIn: 'root',
})
export class PromotionsService {
  private readonly supabase = inject(SupabaseService).client;

  async getPromotions(): Promise<Promotion[]> {
    const { data, error } = await this.supabase
      .from('promotions')
      .select(PROMOTION_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((promotion) => this.mapPromotion(promotion as Promotion));
  }

  async getPromotionById(id: string): Promise<Promotion | null> {
    const { data, error } = await this.supabase
      .from('promotions')
      .select(PROMOTION_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data ? this.mapPromotion(data as Promotion) : null;
  }

  async createPromotion(payload: PromotionMutationPayload): Promise<Promotion> {
    const { data, error } = await this.supabase
      .from('promotions')
      .insert(this.toPromotionRecord(payload))
      .select(PROMOTION_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapPromotion(data as Promotion);
  }

  async updatePromotion(id: string, payload: Partial<PromotionMutationPayload>): Promise<Promotion> {
    const { data, error } = await this.supabase
      .from('promotions')
      .update(this.toPromotionRecord(payload))
      .eq('id', id)
      .select(PROMOTION_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapPromotion(data as Promotion);
  }

  async deletePromotion(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('promotions')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  async getPromotionStats(): Promise<PromotionStats> {
    return this.getStatsFromPromotions(await this.getPromotions());
  }

  getStatsFromPromotions(promotions: Promotion[]): PromotionStats {
    return promotions.reduce<PromotionStats>(
      (stats, promotion) => {
        const status = this.getPromotionStatus(promotion);

        stats.totalPromotions += 1;
        stats.activePromotions += status === 'active' ? 1 : 0;
        stats.scheduledPromotions += status === 'scheduled' ? 1 : 0;
        stats.expiredPromotions += status === 'expired' ? 1 : 0;

        return stats;
      },
      {
        totalPromotions: 0,
        activePromotions: 0,
        scheduledPromotions: 0,
        expiredPromotions: 0,
      }
    );
  }

  getPromotionStatus(promotion: Promotion, now = new Date()): PromotionStatus {
    if (promotion.is_active === false) {
      return 'paused';
    }

    const startDate = this.parseDate(promotion.start_date);
    const endDate = this.parseDate(promotion.end_date);

    if (startDate && startDate > now) {
      return 'scheduled';
    }

    if (endDate && endDate < now) {
      return 'expired';
    }

    return 'active';
  }

  private mapPromotion(promotion: Promotion): Promotion {
    return {
      ...promotion,
      title: promotion.title.trim(),
      description: promotion.description ?? null,
      image_url: promotion.image_url ?? null,
      button_text: promotion.button_text ?? null,
      button_link: promotion.button_link ?? null,
      placement: promotion.placement ?? null,
      background_color: promotion.background_color ?? null,
      text_color: promotion.text_color ?? null,
      is_active: promotion.is_active ?? true,
      start_date: promotion.start_date ?? null,
      end_date: promotion.end_date ?? null,
    };
  }

  private toPromotionRecord(payload: Partial<PromotionMutationPayload>): Partial<PromotionMutationPayload> {
    const record: Partial<PromotionMutationPayload> = {};

    if (payload.title !== undefined) {
      record.title = payload.title.trim();
    }

    if (payload.description !== undefined) {
      record.description = payload.description?.trim() || null;
    }

    if (payload.image_url !== undefined) {
      record.image_url = payload.image_url?.trim() || null;
    }

    if (payload.button_text !== undefined) {
      record.button_text = payload.button_text?.trim() || null;
    }

    if (payload.button_link !== undefined) {
      record.button_link = payload.button_link?.trim() || null;
    }

    if (payload.placement !== undefined) {
      record.placement = payload.placement?.trim() || null;
    }

    if (payload.background_color !== undefined) {
      record.background_color = payload.background_color?.trim() || null;
    }

    if (payload.text_color !== undefined) {
      record.text_color = payload.text_color?.trim() || null;
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

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
