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
