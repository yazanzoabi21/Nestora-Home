export type DiscountType = 'percentage' | 'fixed_amount' | 'free_shipping';
export type DiscountAppliesTo = 'all' | 'product' | 'category';
export type DiscountStatus = 'active' | 'scheduled' | 'expired' | 'paused';
export type DiscountStatusFilter = 'all' | DiscountStatus;

export interface Discount {
  id: string;
  name: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number | null;
  minimum_order_amount: number | null;
  applies_to: DiscountAppliesTo;
  product_id: string | null;
  category_id: string | null;
  usage_limit: number | null;
  usage_count: number;
  usage_per_customer: number | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  products?: { name: string } | null;
  categories?: { name: string } | null;
}

export interface DiscountMutationPayload {
  name: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number | null;
  minimum_order_amount: number | null;
  applies_to: DiscountAppliesTo;
  product_id: string | null;
  category_id: string | null;
  usage_limit: number | null;
  usage_count?: number;
  usage_per_customer: number | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
}

export interface DiscountStats {
  totalDiscounts: number;
  activeDiscounts: number;
  scheduledDiscounts: number;
  expiredDiscounts: number;
  pausedDiscounts: number;
  totalUsage: number;
  averageUsage: number;
}

export interface DiscountFormModel {
  name: string;
  code: string;
  discountType: DiscountType;
  discountValue: number | null;
  minimumOrderAmount: number | null;
  appliesTo: DiscountAppliesTo;
  productId: string | null;
  categoryId: string | null;
  usageLimit: number | null;
  usageCount: number;
  usagePerCustomer: number | null;
  isActive: boolean;
  startDate: string;
  endDate: string;
}
