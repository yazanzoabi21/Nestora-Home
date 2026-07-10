import { Component, DestroyRef, computed, signal, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { LegendOptions, Options, XAxisOptions, YAxisOptions } from 'highcharts';
import { SkeletonModule } from 'primeng/skeleton';

import { AnalyticsChart, AnalyticsChartConfig } from '../../../../shared/ui/analytics-chart';
import { DashboardCard } from '../../../../shared/ui/dashboard-card';
import { ExportReportComponent, ExportReportConfig } from '../../../../shared/ui/export-report';
import { KpiCardComponent, KpiCardData } from '../../../../shared/ui/kpi-card';
import { DashboardService, DashboardStatisticsRow } from '../../../../data-access/services/dashboard.service';

type DashboardTrendType = 'up' | 'down';
type DashboardTone = 'positive' | 'negative';

interface PerformanceMetric {
  label: string;
  labelKey: string;
  value: string;
  change: string;
  tone: DashboardTone;
}

interface RecentOrder {
  id: string;
  customer: string;
  email: string;
  date: string;
  total: string;
  payment: string;
  delivery: string;
}

interface BestSellingProduct {
  rank: number;
  name: string;
  trend: string;
  trendType: DashboardTrendType;
  sold: string;
  progress: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    DashboardCard,
    KpiCardComponent,
    AnalyticsChart,
    ExportReportComponent,
    SkeletonModule,
    TranslatePipe,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {

  constructor() {
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.langVersion.update((version) => version + 1));
  }

  ngOnInit(): void {
    void this.loadDashboard('30D');
  }

  private readonly dashboardService = inject(DashboardService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private dashboardRequestId = 0;

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly dashboardData = signal<DashboardStatisticsRow | null>(null);
  readonly langVersion = signal(0);

  readonly revenueFilter = signal('12M');
  readonly salesOrdersFilter = signal('7D');
  readonly performanceFilter = signal('30D');
  readonly recentOrdersFilter = signal('All');
  readonly bestSellingFilter = signal('Sold');

  readonly performanceFilters = ['7D', '30D', '3M'];
  readonly recentOrdersFilters = ['All', 'Paid', 'Pending', 'Refunded'];
  readonly bestSellingFilters = ['Sold'];
  readonly kpiSkeletonItems = Array.from({ length: 4 }, (_, index) => index);
  readonly performanceSkeletonItems = Array.from({ length: 4 }, (_, index) => index);
  readonly tableSkeletonRows = Array.from({ length: 6 }, (_, index) => index);
  readonly productSkeletonRows = Array.from({ length: 5 }, (_, index) => index);

  readonly revenueOverviewChart = computed<AnalyticsChartConfig>(() => {
    this.langVersion();
    const chart = this.dashboardData()?.revenue_overview_chart;

    return this.buildRevenueOverviewChart({
      categories: chart?.categories ?? [],
      revenue: chart?.revenue ?? [],
      target: chart?.target ?? [],
    });
  });

  readonly salesOrdersChart = computed<AnalyticsChartConfig>(() => {
    this.langVersion();
    const chart = this.dashboardData()?.sales_orders_chart;

    return this.buildSalesOrdersChart({
      categories: chart?.categories ?? [],
      revenue: chart?.revenue ?? [],
      orders: chart?.orders ?? [],
    });
  });

  readonly salesCategoryChart = computed<AnalyticsChartConfig>(() => {
    this.langVersion();
    return this.buildSalesCategoryChart(this.dashboardData()?.sales_category_chart ?? []);
  });

  readonly performanceMetrics = computed(() => {
    return this.dashboardData()?.sales_performance_card ?? [];
  });

  readonly recentOrders = computed(() => {
    const orders = this.dashboardData()?.recent_orders_card ?? [];
    const filter = this.recentOrdersFilter();

    if (filter === 'All') {
      return orders;
    }

    return orders.filter((order) => order.payment === filter);
  });

  readonly bestSellingProducts = computed(() => {
    return this.dashboardData()?.best_selling_products_card ?? [];
  });

  readonly kpiCards = computed<KpiCardData[]>(() => {
    this.langVersion();
    return this.dashboardData()?.kpi_cards ?? [];
  });

  readonly dashboardExportConfig = computed<ExportReportConfig>(() => {
    this.langVersion();

    return {
      fileName: 'nestora-dashboard-report',
      reportTitle: this.t('DASHBOARD.EXPORT_REPORT_TITLE'),
      reportSubtitle: this.t('DASHBOARD.MONTH'),
      sections: [
        {
          title: this.t('DASHBOARD.KPI_SUMMARY'),
          headers: [this.t('DASHBOARD.METRIC'), this.t('DASHBOARD.VALUE'), this.t('DASHBOARD.TREND')],
          rows: [
            [this.t('DASHBOARD.TOTAL_REVENUE'), '$891.4K', '+18.4%'],
            [this.t('DASHBOARD.TOTAL_ORDERS'), '6.8K', '+12.2%'],
            [this.t('DASHBOARD.TOTAL_CUSTOMERS'), '14.3K', '+8.6%'],
            [this.t('DASHBOARD.ACTIVE_PRODUCTS'), '524', '-2.1%'],
          ],
        },
        {
          title: this.t('DASHBOARD.RECENT_ORDERS'),
          headers: [
            this.t('DASHBOARD.ORDER_ID'),
            this.t('DASHBOARD.CUSTOMER'),
            this.t('DASHBOARD.DATE'),
            this.t('DASHBOARD.TOTAL'),
            this.t('DASHBOARD.PAYMENT'),
            this.t('DASHBOARD.DELIVERY'),
          ],
          rows: [
            ['ORD-8821', 'Sophie Barrett', '22 Apr 2026', '$248.97', this.dashboardStatusLabel('Paid'), this.dashboardStatusLabel('Delivered')],
            ['ORD-8820', 'Marcus Hunt', '22 Apr 2026', '$89.99', this.dashboardStatusLabel('Paid'), this.dashboardStatusLabel('Shipped')],
            ['ORD-8819', 'Clara Morel', '21 Apr 2026', '$387.45', this.dashboardStatusLabel('Paid'), this.dashboardStatusLabel('Processing')],
            ['ORD-8818', 'James Thornton', '21 Apr 2026', '$124.98', this.dashboardStatusLabel('Pending'), this.dashboardStatusLabel('Processing')],
            ['ORD-8817', 'Anya Patel', '20 Apr 2026', '$312.96', this.dashboardStatusLabel('Paid'), this.dashboardStatusLabel('Delivered')],
            ['ORD-8816', 'Luca Rossi', '20 Apr 2026', '$149.99', this.dashboardStatusLabel('Refunded'), this.dashboardStatusLabel('Returned')],
          ],
        },
        {
          title: this.t('DASHBOARD.BEST_SELLING_PRODUCTS'),
          headers: [this.t('DASHBOARD.PRODUCT'), this.t('DASHBOARD.TREND'), this.t('DASHBOARD.SOLD')],
          rows: [
            [this.t('DASHBOARD.ECO_CLEANING_KIT_BUNDLE'), '+24%', this.t('DASHBOARD.SOLD_COUNT', { count: '1,203' })],
            [this.t('DASHBOARD.BAMBOO_CUTTING_BOARD'), '+18%', this.t('DASHBOARD.SOLD_COUNT', { count: '876' })],
            [this.t('DASHBOARD.LINEN_TEA_TOWEL_SET'), '+12%', this.t('DASHBOARD.SOLD_COUNT', { count: '892' })],
            [this.t('DASHBOARD.STAINLESS_CHEFS_KNIFE'), '+8%', this.t('DASHBOARD.SOLD_COUNT', { count: '703' })],
            [this.t('DASHBOARD.NORDIC_CERAMIC_BOWL_SET'), '-4%', this.t('DASHBOARD.SOLD_COUNT', { count: '567' })],
          ],
        },
      ],
    };
  });

  setRevenueFilter(filter: string): void {
    this.revenueFilter.set(filter);
    void this.loadDashboard(filter);
  }

  setSalesOrdersFilter(filter: string): void {
    this.salesOrdersFilter.set(filter);
    void this.loadDashboard(filter);
  }

  setPerformanceFilter(filter: string): void {
    this.performanceFilter.set(filter);
    void this.loadDashboard(filter);
  }

  setRecentOrdersFilter(filter: string): void {
    this.recentOrdersFilter.set(filter);
  }

  setBestSellingFilter(filter: string): void {
    this.bestSellingFilter.set(filter);
  }

  selectMonth(): void {
    // Later: open month filter dropdown/modal.
  }

  exportReport(): void {
    // Export is handled by app-export-report.
  }

  goToOrders(): void {
    // Later: navigate to orders page.
  }

  openBestSellingMenu(): void {
    // Later: open product menu/filter/export.
  }

  t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params) as string;
  }

  translationKey(value: string): string {
    return value.trim().replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
  }

  dashboardStatusLabel(status: string): string {
    const key = `DASHBOARD.STATUS.${this.translationKey(status)}`;
    const translated = this.t(key);
    return translated === key ? status : translated;
  }

  soldLabel(value: string): string {
    const match = value.match(/^(.+?)\s+sold$/i);
    return match ? this.t('DASHBOARD.SOLD_COUNT', { count: match[1] }) : value;
  }

  paymentClass(payment: string): string {
    const classes: Record<string, string> = {
      Paid: 'bg-[#e7f6ee] text-[#0f7b49]',
      Pending: 'bg-[#fff4df] text-[#b97712]',
      Refunded: 'bg-[#edf4ff] text-[#1e5aa8]',
    };

    return classes[payment] || 'bg-[#f1f0ee] text-[#8d877e]';
  }

  deliveryClass(delivery: string): string {
    const classes: Record<string, string> = {
      Delivered: 'bg-[#e7f6ee] text-[#0f7b49]',
      Shipped: 'bg-[#eaf2ff] text-[#1e5aa8]',
      Processing: 'bg-[#fff4df] text-[#b97712]',
      Returned: 'bg-[#f3e8ff] text-[#7b3fb2]',
    };

    return classes[delivery] || 'bg-[#f1f0ee] text-[#8d877e]';
  }

  private buildRevenueOverviewChart(data: {
    categories: string[];
    revenue: number[];
    target: number[];
  }): AnalyticsChartConfig {
    return {
      title: 'Revenue Overview',
      titleKey: 'DASHBOARD.REVENUE_OVERVIEW',
      subtitle: this.t('DASHBOARD.REVENUE_OVERVIEW_SUBTITLE'),
      subtitleKey: 'DASHBOARD.REVENUE_OVERVIEW_SUBTITLE',
      filters: ['7D', '30D', '3M', '12M'],
      filterLabelPrefix: 'DASHBOARD.FILTERS',
      activeFilter: this.revenueFilter(),
      height: 315,
      chartOptions: this.createRevenueOverviewOptions(data),
      loadingConfig: {
        type: 'line',
        showLegend: true,
        seriesCount: 2,
        categoryCount: data.categories.length || 7,
      },
    };
  }

  private buildSalesCategoryChart(
    categories: { name: string; nameKey?: string | null; value: number; color: string }[]
  ): AnalyticsChartConfig {
    return {
      title: 'Sales by Category',
      titleKey: 'DASHBOARD.SALES_BY_CATEGORY',
      subtitle: this.t('DASHBOARD.SALES_BY_CATEGORY_SUBTITLE'),
      subtitleKey: 'DASHBOARD.SALES_BY_CATEGORY_SUBTITLE',
      height: 280,
      chartOptions: this.createSalesCategoryOptions(categories),
      loadingConfig: {
        type: 'donut',
        showLegend: true,
        seriesCount: 1,
        categoryCount: categories.length || 4,
      },
      legendItems: categories.map((category) => ({
        name: category.name,
        nameKey: category.nameKey ?? undefined,
        value: category.value,
        suffix: '%',
        color: category.color,
      })),
    };
  }

  private buildSalesOrdersChart(data: {
    categories: string[];
    revenue: number[];
    orders: number[];
  }): AnalyticsChartConfig {
    return {
      title: 'Sales vs Orders',
      titleKey: 'DASHBOARD.SALES_VS_ORDERS',
      subtitle: this.t('DASHBOARD.SALES_VS_ORDERS_SUBTITLE'),
      subtitleKey: 'DASHBOARD.SALES_VS_ORDERS_SUBTITLE',
      filters: ['7D', '30D', '3M', '12M'],
      activeFilter: this.salesOrdersFilter(),
      height: 320,
      chartOptions: this.createSalesOrdersOptions(data),
      loadingConfig: {
        type: 'column',
        showLegend: true,
        seriesCount: 2,
        categoryCount: data.categories.length || 7,
      },
    };
  }

  private createRevenueOverviewOptions(data: { categories: string[]; revenue: number[]; target: number[] }): Options {
    return {
      chart: {
        type: 'line',
        height: 315,
        backgroundColor: 'transparent',
        spacing: [12, 8, 8, 0],
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: this.defaultLegend(),
      xAxis: this.defaultXAxis(data.categories),
      yAxis: this.defaultYAxis('${value}k'),
      tooltip: {
        borderColor: '#e5ded2',
        borderRadius: 12,
        shadow: false,
        valuePrefix: '$',
        valueSuffix: 'k',
      },
      plotOptions: {
        series: {
          marker: {
            enabled: false,
            symbol: 'circle',
          },
          lineWidth: 3,
        },
      },
      series: [
        {
          type: 'line',
          name: this.t('DASHBOARD.REVENUE'),
          color: '#5f6f43',
          data: data.revenue,
        },
        {
          type: 'line',
          name: this.t('DASHBOARD.TARGET'),
          color: '#d9cab8',
          dashStyle: 'Dash',
          data: data.target,
        },
      ],
    };
  }

  private createSalesCategoryOptions(
    categories: { name: string; nameKey?: string | null; value: number; color: string }[]
  ): Options {
    return {
      chart: {
        type: 'pie',
        height: 280,
        backgroundColor: 'transparent',
        spacing: [0, 0, 0, 0],
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      tooltip: {
        pointFormat: '<b>{point.y}%</b>',
        borderColor: '#e5ded2',
        borderRadius: 12,
        shadow: false,
      },
      plotOptions: {
        pie: {
          innerSize: '66%',
          borderWidth: 0,
          dataLabels: { enabled: false },
        },
      },
      series: [
        {
          type: 'pie',
          name: this.t('DASHBOARD.SALES'),
          data: categories.map((category) => ({
            name: category.name,
            y: category.value,
            color: category.color,
          })),
        },
      ],
    };
  }

  private createSalesOrdersOptions(data: { categories: string[]; revenue: number[]; orders: number[] }): Options {
    return {
      chart: {
        type: 'column',
        height: 320,
        backgroundColor: 'transparent',
        spacing: [12, 8, 8, 0],
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: this.defaultLegend(),
      xAxis: this.defaultXAxis(data.categories),
      yAxis: [
        this.defaultYAxis('${value}k'),
        {
          title: { text: undefined },
          opposite: true,
          gridLineWidth: 0,
          labels: {
            style: { color: '#8d877e', fontSize: '12px' },
          },
        },
      ],
      tooltip: {
        borderColor: '#e5ded2',
        borderRadius: 12,
        shadow: false,
      },
      plotOptions: {
        column: {
          borderWidth: 0,
          borderRadius: 7,
          pointPadding: 0.2,
          groupPadding: 0.18,
        },
      },
      series: [
        {
          type: 'column',
          name: this.t('DASHBOARD.REVENUE'),
          color: '#5f6f43',
          data: data.revenue,
        },
        {
          type: 'column',
          name: this.t('DASHBOARD.ORDERS'),
          color: '#e7d9c9',
          yAxis: 1,
          data: data.orders,
        },
      ],
    };
  }

  private defaultLegend(): LegendOptions {
    return {
      align: 'center',
      verticalAlign: 'bottom',
      itemStyle: {
        color: '#5f6f43',
        fontSize: '13px',
        fontWeight: '600',
      },
    };
  }

  private defaultXAxis(categories: string[]): XAxisOptions {
    return {
      categories,
      lineColor: '#eee8df',
      tickLength: 0,
      labels: {
        style: {
          color: '#8d877e',
          fontSize: '12px',
        },
      },
    };
  }

  private defaultYAxis(format: string): YAxisOptions {
    return {
      title: { text: undefined },
      gridLineColor: '#eee8df',
      gridLineDashStyle: 'Dash',
      labels: {
        style: {
          color: '#8d877e',
          fontSize: '12px',
        },
        format,
      },
    };
  }

  async loadDashboard(periodKey = '30D'): Promise<void> {
    const requestId = ++this.dashboardRequestId;

    try {
      this.loading.set(true);
      this.errorMessage.set(null);

      const data = await this.dashboardService.refreshStatistics(periodKey);

      if (requestId !== this.dashboardRequestId) {
        return;
      }

      this.dashboardData.set(data);
    } catch (error) {
      if (requestId !== this.dashboardRequestId) {
        return;
      }

      console.error('Failed to load dashboard statistics:', error);
      this.errorMessage.set(this.t('DASHBOARD.LOAD_FAILED_DETAIL'));
    } finally {
      if (requestId === this.dashboardRequestId) {
        this.loading.set(false);
      }
    }
  }
}
