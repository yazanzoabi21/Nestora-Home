import { DiscountType } from './discount.model';

export type CustomerOfferType = 'discount' | 'referral' | 'app' | 'loyalty' | 'marketing';
export type CustomerOfferAudience = 'all' | 'guest' | 'customer' | 'new_customer';
export type CustomerOfferStatus = 'active' | 'scheduled' | 'expired' | 'inactive';

export interface CustomerOfferDiscount {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number | null;
  is_active: boolean;
}

export interface CustomerOffer {
  id: string;
  slug: string;
  discount_id: string | null;
  offer_type: CustomerOfferType;
  audience: CustomerOfferAudience;
  icon: string | null;
  title_en: string;
  title_ar: string;
  description_en: string | null;
  description_ar: string | null;
  badge_en: string | null;
  badge_ar: string | null;
  action_text_en: string | null;
  action_text_ar: string | null;
  action_link: string | null;
  background_color: string;
  button_color: string;
  show_discount_code: boolean;
  sort_order: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  discount?: CustomerOfferDiscount | null;
}

export interface CustomerOfferMutationPayload {
  slug: string;
  discount_id: string | null;
  offer_type: CustomerOfferType;
  audience: CustomerOfferAudience;
  icon: string | null;
  title_en: string;
  title_ar: string;
  description_en: string | null;
  description_ar: string | null;
  badge_en: string | null;
  badge_ar: string | null;
  action_text_en: string | null;
  action_text_ar: string | null;
  action_link: string | null;
  background_color: string;
  button_color: string;
  show_discount_code: boolean;
  sort_order: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
}
