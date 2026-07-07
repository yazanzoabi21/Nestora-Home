import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnalyticsKpiCard, AnalyticsRow } from '../../../data-access/models/analytics.model';
import { AnalyticsService } from '../../../data-access/services';
import { AnalyticsChart } from '../../../shared/ui/analytics-chart';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [FormsModule, KpiCardComponent, AnalyticsChart],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
})
export class AnalyticsComponent implements OnInit {
  private readonly analyticsService = inject(AnalyticsService);

  readonly periodOptions = ['7D', '30D', '3M', '12M'];
  readonly selectedPeriod = signal('12M');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly analytics = signal<AnalyticsRow | null>(null);

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const cards = this.analytics()?.kpi_cards;

    return (Array.isArray(cards) ? cards : []).map((card) => this.mapKpiCard(card));
  });

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
      this.error.set('Failed to load analytics data.');
    } finally {
      this.loading.set(false);
    }
  }

  exportAnalytics(): void {
    // Placeholder for the upcoming analytics export flow.
  }

  private mapKpiCard(card: Partial<AnalyticsKpiCard>): KpiCardData {
    const tone = card.tone ?? 'neutral';
    const isPositive = tone === 'positive';
    const isNegative = tone === 'negative';
    const trendType = isPositive ? 'up' : isNegative ? 'down' : undefined;

    return {
      title: card.title ?? 'Untitled KPI',
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
