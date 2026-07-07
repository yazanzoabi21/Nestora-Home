import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/services';
import { AnalyticsRow } from '../models/analytics.model';

@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  private readonly supabase = inject(SupabaseService).client;

  async refreshAnalyticsByPeriod(periodKey: string): Promise<AnalyticsRow | null> {
    const { data, error } = await this.supabase.rpc('refresh_analytics', {
      p_period_key: periodKey,
    });

    if (error) {
      throw error;
    }

    return data as AnalyticsRow | null;
  }

  async getAnalyticsByPeriod(periodKey: string): Promise<AnalyticsRow | null> {
    const { data, error } = await this.supabase
      .from('analytics')
      .select('*')
      .eq('period_key', periodKey)
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data as AnalyticsRow;
  }
}
