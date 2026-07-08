import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AnalyticsKpiCard, AnalyticsRow } from '../../../data-access/models/analytics.model';
import { AnalyticsService } from '../../../data-access/services';
import { AnalyticsChart } from '../../../shared/ui/analytics-chart';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [FormsModule, KpiCardComponent, AnalyticsChart, TranslatePipe],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
})
export class AnalyticsComponent implements OnInit {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly periodOptions = computed(() => {
    this.langVersion();

    return ['7D', '30D', '3M', '12M'].map((period) => ({
      value: period,
      label: this.periodLabel(period),
    }));
  });
  readonly selectedPeriod = signal('12M');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly analytics = signal<AnalyticsRow | null>(null);
  readonly langVersion = signal(0);

  readonly kpiCards = computed<KpiCardData[]>(() => {
    this.langVersion();
    const cards = this.analytics()?.kpi_cards;

    return (Array.isArray(cards) ? cards : []).map((card) => this.mapKpiCard(card));
  });

  constructor() {
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.langVersion.update((version) => version + 1));
  }

  ngOnInit(): void {
    void this.loadAnalytics();
  }

  onPeriodChange(periodKey: string): void {
    this.selectedPeriod.set(periodKey);
    void this.loadAnalytics();
  }

  async loadAnalytics(): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const data = await this.analyticsService.refreshAnalyticsByPeriod(this.selectedPeriod());
      this.analytics.set(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      this.analytics.set(null);
      this.error.set(this.t('ANALYTICS.TOAST.LOAD_FAILED_DETAIL'));
    } finally {
      this.loading.set(false);
    }
  }

  exportAnalytics(): void {
    // Placeholder for the upcoming analytics export flow.
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params) as string;
  }

  private optionalT(key: string, fallback: string): string {
    const translated = this.t(key);
    return translated === key ? fallback : translated;
  }

  private translationKey(value: string): string {
    return value.trim().replace(/[\s-]+/g, '_').toUpperCase();
  }

  private kpiTitle(title?: string): string {
    if (!title) {
      return this.t('ANALYTICS.KPI.UNTITLED');
    }

    return this.optionalT(`ANALYTICS.KPI.${this.translationKey(title)}`, title);
  }

  private periodLabel(period: string): string {
    const periodKeyMap: Record<string, string> = {
      '7D': 'LAST_7_DAYS',
      '30D': 'LAST_30_DAYS',
      '3M': 'LAST_3_MONTHS',
      '12M': 'LAST_12_MONTHS',
    };
    const key = periodKeyMap[period] ?? this.translationKey(period);
    return this.optionalT(`ANALYTICS.PERIODS.${key}`, period);
  }

  private mapKpiCard(card: Partial<AnalyticsKpiCard>): KpiCardData {
    const tone = card.tone ?? 'neutral';
    const isPositive = tone === 'positive';
    const isNegative = tone === 'negative';
    const trendType = isPositive ? 'up' : isNegative ? 'down' : undefined;

    return {
      title: this.kpiTitle(card.title),
      value: card.value ?? '-',
      icon: card.icon || 'pi pi-chart-line',
      iconColor: isNegative ? '#dc3f35' : '#5f6f43',
      iconBg: isNegative ? '#fff1f0' : '#eef4e8',
      trend: card.change ?? '',
      trendType,
      trendColor: isNegative ? '#dc3f35' : isPositive ? '#0f7b49' : '#8d877e',
      subtitle: card.changeLabel ?? '',
      subtitleColor: '#8d877e',
      showChart: false,
    };
  }
}
