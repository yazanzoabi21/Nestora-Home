export interface LoyaltyProgramSettings {
  id: true;
  is_enabled: boolean;
  point_value_usd: number;
  points_earned_per_usd: number;
  minimum_redemption_points: number;
  updated_at: string;
}

export interface LoyaltyProductPreview {
  effectivePrice: number;
  pointsEarned: number;
  rewardCost: number;
}

export type LoyaltyTransactionType =
  | 'earn'
  | 'redeem'
  | 'earn_reversal'
  | 'redemption_refund'
  | 'adjustment';

export interface CustomerLoyaltyTransaction {
  id: string;
  transactionType: LoyaltyTransactionType;
  pointsDelta: number;
  note: string | null;
  createdAt: string;
  orderId: string | null;
  orderItemId: string | null;
  orderNumber: string | null;
  orderStatus: string | null;
}

export interface LoyaltyRedeemableProduct {
  productId: string;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  effectivePrice: number;
  pointsCost: number;
  stock: number;
  categoryName: string | null;
}
