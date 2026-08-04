import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { CustomerAuthService } from '../../../core/services/auth';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { LoyaltyProductPreview, LoyaltyProgramSettings } from '../models';

const DEFAULT_SETTINGS: LoyaltyProgramSettings = {
  id: true,
  is_enabled: true,
  point_value_usd: 0.02,
  points_earned_per_usd: 1,
  minimum_redemption_points: 400,
  updated_at: '',
};

@Injectable({ providedIn: 'root' })
export class LoyaltyPointsCalculatorService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly auth = inject(CustomerAuthService);
  private readonly settingsState = signal<LoyaltyProgramSettings>(DEFAULT_SETTINGS);
  private readonly balanceState = signal(0);
  private readonly requestedRedemptionsState = signal<ReadonlySet<string>>(new Set());

  readonly settings = this.settingsState.asReadonly();
  readonly balance = this.balanceState.asReadonly();
  readonly loading = signal(true);
  readonly balanceLoading = signal(false);
  readonly enabled = computed(() => this.settings().is_enabled);
  readonly requestedRedemptionProductIds = computed(
    () => [...this.requestedRedemptionsState()],
  );

  constructor() {
    void this.refresh().catch(() => undefined);
    effect(() => {
      if (this.auth.isLoading()) return;
      if (this.auth.isAuthenticated()) {
        void this.refreshBalance().catch(() => undefined);
      } else {
        this.balanceState.set(0);
        this.clearRedemptions();
      }
    });
    effect((onCleanup) => {
      const userId = this.auth.user()?.id;
      if (!this.auth.isAuthenticated() || !userId) return;

      const channel = this.supabase
        .channel(`customer-loyalty-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'customer_loyalty_points_ledger',
            filter: `user_id=eq.${userId}`,
          },
          () => void this.refreshBalance().catch(() => undefined),
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'loyalty_program_settings',
          },
          () => void this.refresh().catch(() => undefined),
        )
        .subscribe();

      onCleanup(() => void this.supabase.removeChannel(channel));
    });
  }

  effectivePrice(price: number | null | undefined, salePrice?: number | null): number {
    const regular = this.nonNegativeNumber(price);
    const sale = salePrice === null || salePrice === undefined
      ? null
      : this.nonNegativeNumber(salePrice);
    return sale !== null && sale > 0 && sale < regular ? sale : regular;
  }

  preview(price: number | null | undefined, salePrice?: number | null): LoyaltyProductPreview {
    const effectivePrice = this.effectivePrice(price, salePrice);
    const settings = this.settings();
    return {
      effectivePrice,
      pointsEarned: Math.floor(effectivePrice * settings.points_earned_per_usd),
      rewardCost: effectivePrice > 0
        ? Math.ceil(effectivePrice / settings.point_value_usd)
        : 0,
    };
  }

  canRedeem(rewardCost: number, quantity = 1): boolean {
    const totalCost = Math.ceil(rewardCost * Math.max(1, quantity));
    return this.enabled()
      && totalCost >= this.settings().minimum_redemption_points
      && this.balance() >= totalCost;
  }

  pointsNeeded(rewardCost: number, quantity = 1): number {
    return Math.max(0, Math.ceil(rewardCost * Math.max(1, quantity)) - this.balance());
  }

  requestProductRedemption(productId: string): void {
    this.requestedRedemptionsState.update((current) => new Set(current).add(productId));
  }

  clearProductRedemption(productId: string): void {
    this.requestedRedemptionsState.update((current) => {
      const next = new Set(current);
      next.delete(productId);
      return next;
    });
  }

  clearRedemptions(): void {
    this.requestedRedemptionsState.set(new Set());
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('loyalty_program_settings')
        .select('id,is_enabled,point_value_usd,points_earned_per_usd,minimum_redemption_points,updated_at')
        .eq('id', true)
        .single();
      if (error) throw new Error(error.message);

      this.settingsState.set({
        id: true,
        is_enabled: data.is_enabled !== false,
        point_value_usd: this.positiveNumber(data.point_value_usd, DEFAULT_SETTINGS.point_value_usd),
        points_earned_per_usd: this.nonNegativeNumber(data.points_earned_per_usd),
        minimum_redemption_points: Math.max(0, Math.floor(Number(data.minimum_redemption_points))),
        updated_at: typeof data.updated_at === 'string' ? data.updated_at : '',
      });
      await this.refreshBalance();
    } finally {
      this.loading.set(false);
    }
  }

  async refreshBalance(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this.balanceState.set(0);
      return;
    }

    this.balanceLoading.set(true);
    try {
      const { data, error } = await this.supabase.rpc('get_my_loyalty_balance');
      if (error) throw new Error(error.message);
      this.balanceState.set(Math.max(0, Math.floor(Number(data ?? 0))));
    } finally {
      this.balanceLoading.set(false);
    }
  }

  private nonNegativeNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  private positiveNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
