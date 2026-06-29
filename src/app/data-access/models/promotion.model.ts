export type PromotionStatus = 'active' | 'scheduled' | 'expired' | 'paused';

export interface Promotion {
  id: string;
  title: string;
  description?: string | null;
  image_url?: string | null;
  button_text?: string | null;
  button_link?: string | null;
  placement?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  is_active?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
}

export interface PromotionMutationPayload {
  title: string;
  description?: string | null;
  image_url?: string | null;
  button_text?: string | null;
  button_link?: string | null;
  placement?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  is_active?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface PromotionStats {
  totalPromotions: number;
  activePromotions: number;
  scheduledPromotions: number;
  expiredPromotions: number;
}
