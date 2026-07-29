export type PromotionStatus = 'active' | 'scheduled' | 'expired' | 'inactive';

export type PromotionDisplayType = 'bar' | 'banner' | 'popup';

export type PromotionType = PromotionDisplayType;

export interface Promotion {
  id: string;
  slug?: string | null;

  title: string;
  description?: string | null;

  media_id?: string | null;
  image_url?: string | null;

  button_text?: string | null;
  button_link?: string | null;

  placement?: string | null;
  display_type?: PromotionDisplayType | null;

  icon?: string | null;
  badge_text?: string | null;
  secondary_badge_text?: string | null;

  background_color?: string | null;
  text_color?: string | null;

  sort_order?: number | null;

  is_active?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
}

export interface PromotionMutationPayload {
  title: string;
  slug: string | null;
  description: string | null;

  media_id?: string | null;
  image_url: string | null;

  button_text: string | null;
  button_link: string | null;

  placement: string | null;
  display_type: PromotionDisplayType | null;

  icon: string | null;
  badge_text: string | null;
  secondary_badge_text: string | null;

  background_color: string | null;
  text_color: string | null;

  sort_order: number;

  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
}

export interface PromotionSelectableProduct {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  category_name: string | null;
  image_url: string | null;
  price: number;
  sale_price: number | null;
  is_active: boolean | null;
}

export interface PromotionStats {
  totalPromotions: number;
  activeNow: number;
  scheduled: number;
  inactive: number;
  expired: number;
}
