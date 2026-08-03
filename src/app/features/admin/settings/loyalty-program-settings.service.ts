import { Injectable, inject } from '@angular/core';

import { ADMIN_SUPABASE } from '../../../core/tokens';

export interface AdminLoyaltyProgramSettings {
  isEnabled: boolean;
  pointValueUsd: number;
  pointsEarnedPerUsd: number;
  minimumRedemptionPoints: number;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class LoyaltyProgramSettingsService {
  private readonly supabase = inject(ADMIN_SUPABASE);

  async getSettings(): Promise<AdminLoyaltyProgramSettings> {
    const { data, error } = await this.supabase
      .from('loyalty_program_settings')
      .select('is_enabled,point_value_usd,points_earned_per_usd,minimum_redemption_points,updated_at')
      .eq('id', true)
      .single();
    if (error) throw new Error(error.message);

    return {
      isEnabled: data.is_enabled !== false,
      pointValueUsd: Number(data.point_value_usd),
      pointsEarnedPerUsd: Number(data.points_earned_per_usd),
      minimumRedemptionPoints: Number(data.minimum_redemption_points),
      updatedAt: String(data.updated_at ?? ''),
    };
  }

  async updateSettings(settings: AdminLoyaltyProgramSettings): Promise<AdminLoyaltyProgramSettings> {
    const { error } = await this.supabase
      .from('loyalty_program_settings')
      .update({
        is_enabled: settings.isEnabled,
        point_value_usd: settings.pointValueUsd,
        points_earned_per_usd: settings.pointsEarnedPerUsd,
        minimum_redemption_points: settings.minimumRedemptionPoints,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true);
    if (error) throw new Error(error.message);
    return this.getSettings();
  }
}
