import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../core/services/supabase';
import {
  Promotion,
  PromotionMutationPayload,
  PromotionStats,
  PromotionStatus,
  PromotionType,
} from '../models';

const PROMOTION_SELECT = `
  id,
  title,
  description,
  media_id,
  image_url,
  button_text,
  button_link,
  placement,
  display_type,
  icon,
  background_color,
  text_color,
  is_active,
  start_date,
  end_date,
  created_at
`;
const PROMOTION_IMAGES_BUCKET = 'product-images';
const MAX_PROMOTION_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

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

  async uploadPromotionImage(file: File): Promise<string> {
    this.validatePromotionImage(file);

    const path = `promotions/${this.currentYearMonth()}/${this.randomId()}.${this.fileExtension(file.name)}`;
    const { error } = await this.supabase.storage.from(PROMOTION_IMAGES_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = this.supabase.storage.from(PROMOTION_IMAGES_BUCKET).getPublicUrl(path);

    if (!data.publicUrl) {
      throw new Error('Unable to get uploaded promotion image URL.');
    }

    return data.publicUrl;
  }

  async deletePromotionImageByUrl(imageUrl: string): Promise<void> {
    const path = this.storagePathFromPublicUrl(imageUrl);

    if (!path) {
      return;
    }

    const { error } = await this.supabase.storage.from(PROMOTION_IMAGES_BUCKET).remove([path]);

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
        stats.activeNow += status === 'active' ? 1 : 0;
        stats.scheduled += status === 'scheduled' ? 1 : 0;
        stats.inactive += status === 'inactive' ? 1 : 0;
        stats.expired += status === 'expired' ? 1 : 0;

        return stats;
      },
      {
        totalPromotions: 0,
        activeNow: 0,
        scheduled: 0,
        inactive: 0,
        expired: 0,
      }
    );
  }

  getPromotionStatus(promotion: Promotion, now = new Date()): PromotionStatus {
    if (promotion.is_active === false) {
      return 'inactive';
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

  getPromotionType(promotion: Promotion): PromotionType {
    if (promotion.display_type === 'bar' || promotion.display_type === 'banner' || promotion.display_type === 'popup') {
      return promotion.display_type;
    }

    const placement = (promotion.placement ?? '').toLowerCase();

    if (placement.includes('popup')) {
      return 'popup';
    }

    if (placement.includes('banner') || placement.includes('homepage') || placement.includes('product')) {
      return 'banner';
    }

    return 'bar';
  }

  private mapPromotion(promotion: Promotion): Promotion {
    return {
      ...promotion,
      title: promotion.title.trim(),
      description: promotion.description ?? null,
      media_id: promotion.media_id ?? null,
      image_url: promotion.image_url ?? null,
      button_text: promotion.button_text ?? null,
      button_link: promotion.button_link ?? null,
      placement: promotion.placement ?? null,
      display_type: promotion.display_type ?? 'bar',
      icon: promotion.icon ?? null,
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

    if (payload.media_id !== undefined) {
      record.media_id = payload.media_id ?? null;
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

    if (payload.display_type !== undefined) {
      record.display_type = payload.display_type ?? null;
    }

    if (payload.icon !== undefined) {
      record.icon = payload.icon?.trim() || null;
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

  private validatePromotionImage(file: File): void {
    if (!file) {
      throw new Error('No promotion image selected.');
    }

    if (!file.type.startsWith('image/')) {
      throw new Error('Unsupported promotion image type.');
    }

    if (file.size > MAX_PROMOTION_IMAGE_SIZE_BYTES) {
      throw new Error('Promotion image is too large.');
    }
  }

  private currentYearMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private randomId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return Math.random().toString(36).slice(2, 12);
  }

  private fileExtension(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
    return extension || 'webp';
  }

  private storagePathFromPublicUrl(imageUrl: string): string | null {
    const marker = `/storage/v1/object/public/${PROMOTION_IMAGES_BUCKET}/`;
    const index = imageUrl.indexOf(marker);

    if (index === -1) {
      return null;
    }

    return decodeURIComponent(imageUrl.slice(index + marker.length));
  }
}
