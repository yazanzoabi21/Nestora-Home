import { DecimalPipe } from '@angular/common';
import { Component, Input, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { HighchartsChartComponent } from 'highcharts-angular';
import type { LegendOptions, Options, XAxisOptions, YAxisOptions } from 'highcharts';
import {
  AnalyticsChartConfig,
  AnalyticsChartData,
  AnalyticsChartProgressItem,
  AnalyticsChartType,
} from './analytics-chart.model';
import {
  CategoryRevenueSplitItem,
  ConversionFunnelItem,
  CustomerGrowthChartData,
  PerformanceBreakdownItem,
  RevenueGrowthChartData,
  WeeklySalesPatternData,
} from '../../../data-access/models/analytics.model';

@Component({
  selector: 'app-analytics-chart',
  standalone: true,
  imports: [DecimalPipe, HighchartsChartComponent, TranslatePipe],
  templateUrl: './analytics-chart.html',
  styleUrl: './analytics-chart.css',
})
export class AnalyticsChart {
  readonly config = input<AnalyticsChartConfig | null>(null);

  @Input() title = '';
  @Input() subtitle?: string;
  @Input() type: AnalyticsChartType = 'line';
  @Input() data: AnalyticsChartData;
  @Input() height = 320;
  @Input() periodOptions?: string[];
  @Input() selectedPeriod?: string;

  readonly filterChange = output<string>();

  readonly chartConfig = computed<AnalyticsChartConfig>(() => {
    const config = this.config();

    if (config) {
      return config;
    }

    return {
      title: this.title,
      subtitle: this.subtitle,
      filters: this.periodOptions,
      activeFilter: this.selectedPeriod,
      height: this.height,
      chartOptions: this.createChartOptions(),
      legendItems: this.createLegendItems(),
    };
  });

  readonly isFunnel = computed(() => !this.config() && this.type === 'funnel');
  readonly isProgress = computed(() => !this.config() && this.type === 'progress');
  readonly showHighcharts = computed(() => !this.isFunnel() && !this.isProgress());
  readonly funnelItems = computed(() => this.normalizeFunnelItems(this.data));
  readonly progressItems = computed(() => this.normalizeProgressItems(this.data));

  selectFilter(filter: string): void {
    this.filterChange.emit(filter);
  }

  trackByFilter(index: number, filter: string): string {
    return filter;
  }

  trackByLegendItem(index: number, item: { name: string; nameKey?: string }): string {
    return item.nameKey || item.name;
  }

  trackByFunnelItem(index: number, item: ConversionFunnelItem): number {
    return item.step || index;
  }

  trackByProgressItem(index: number, item: AnalyticsChartProgressItem): string {
    return item.label || `${index}`;
  }

  toneClass(tone?: string): string {
    const classes: Record<string, string> = {
      positive: 'bg-[#5f6f43]',
      negative: 'bg-[#dc3f35]',
      neutral: 'bg-[#d9cab8]',
    };

    return classes[tone || 'neutral'] || classes['neutral'];
  }

  toneTextClass(tone?: string): string {
    const classes: Record<string, string> = {
      positive: 'text-[#0f7b49]',
      negative: 'text-[#dc3f35]',
      neutral: 'text-[#8d877e]',
    };

    return classes[tone || 'neutral'] || classes['neutral'];
  }

  dropOffText(dropOff: number | string | null): string {
    if (dropOff === null || dropOff === undefined || dropOff === '') {
      return '';
    }

    return typeof dropOff === 'number' ? `${dropOff.toLocaleString()} drop-off` : dropOff;
  }

  private createChartOptions(): Options {
    if (this.type === 'bar') {
      return this.createCustomerGrowthOptions(this.normalizeCustomerGrowthData(this.data));
    }

    if (this.type === 'doughnut') {
      return this.createDoughnutOptions(this.normalizeCategoryItems(this.data));
    }

    return this.createLineOptions();
  }

  private createLineOptions(): Options {
    const revenueGrowth = this.normalizeRevenueGrowthData(this.data);
    const weeklySales = this.normalizeWeeklySalesData(this.data);
    const isWeeklySales = weeklySales.labels.length > 0 && revenueGrowth.revenue.length === 0;
    const labels = isWeeklySales ? weeklySales.labels : revenueGrowth.labels;
    const revenue = isWeeklySales ? weeklySales.revenue : revenueGrowth.revenue;
    const target = isWeeklySales ? [] : revenueGrowth.target ?? [];
    const prefix = 'GBP ';

    return {
      chart: {
        type: 'line',
        height: this.height,
        backgroundColor: 'transparent',
        spacing: [12, 8, 8, 0],
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: this.defaultLegend(),
      xAxis: this.defaultXAxis(labels),
      yAxis: this.defaultYAxis(`${prefix}{value}`),
      tooltip: {
        borderColor: '#e5ded2',
        borderRadius: 12,
        shadow: false,
        valuePrefix: prefix,
      },
      plotOptions: {
        series: {
          marker: { enabled: false, symbol: 'circle' },
          lineWidth: 3,
        },
      },
      series: [
        {
          type: 'line',
          name: isWeeklySales ? 'Revenue' : 'Revenue',
          color: '#5f6f43',
          data: revenue,
        },
        ...(target.length
          ? [
              {
                type: 'line' as const,
                name: 'Target',
                color: '#d9cab8',
                dashStyle: 'Dash' as const,
                data: target,
              },
            ]
          : []),
      ],
    };
  }

  private createCustomerGrowthOptions(data: CustomerGrowthChartData): Options {
    return {
      chart: {
        type: 'column',
        height: this.height,
        backgroundColor: 'transparent',
        spacing: [12, 8, 8, 0],
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: this.defaultLegend(),
      xAxis: this.defaultXAxis(data.labels),
      yAxis: this.defaultYAxis('{value}'),
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
          name: 'New Customers',
          color: '#5f6f43',
          data: data.newCustomers,
        },
        {
          type: 'column',
          name: 'Returning',
          color: '#e7d9c9',
          data: data.returningCustomers,
        },
      ],
    };
  }

  private createDoughnutOptions(items: CategoryRevenueSplitItem[]): Options {
    return {
      chart: {
        type: 'pie',
        height: this.height,
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
          name: 'Revenue split',
          data: items.map((item, index) => ({
            name: item.label,
            y: item.value,
            color: this.chartColor(index),
          })),
        },
      ],
    };
  }

  private createLegendItems() {
    if (this.type !== 'doughnut') {
      return [];
    }

    return this.normalizeCategoryItems(this.data).map((item, index) => ({
      name: item.label,
      value: item.value,
      suffix: '%',
      color: this.chartColor(index),
    }));
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

  private chartColor(index: number): string {
    return ['#5f6f43', '#d9cab8', '#e7d9c9', '#8ea077', '#b8b0a4'][index % 5];
  }

  private normalizeRevenueGrowthData(data: AnalyticsChartData): RevenueGrowthChartData {
    const value = (data ?? {}) as Partial<RevenueGrowthChartData>;

    return {
      labels: Array.isArray(value.labels) ? value.labels : [],
      revenue: Array.isArray(value.revenue) ? value.revenue : [],
      target: Array.isArray(value.target) ? value.target : [],
    };
  }

  private normalizeWeeklySalesData(data: AnalyticsChartData): WeeklySalesPatternData {
    const value = (data ?? {}) as Partial<WeeklySalesPatternData>;

    return {
      labels: Array.isArray(value.labels) ? value.labels : [],
      revenue: Array.isArray(value.revenue) ? value.revenue : [],
    };
  }

  private normalizeCustomerGrowthData(data: AnalyticsChartData): CustomerGrowthChartData {
    const value = (data ?? {}) as Partial<CustomerGrowthChartData>;

    return {
      labels: Array.isArray(value.labels) ? value.labels : [],
      newCustomers: Array.isArray(value.newCustomers) ? value.newCustomers : [],
      returningCustomers: Array.isArray(value.returningCustomers) ? value.returningCustomers : [],
    };
  }

  private normalizeCategoryItems(data: AnalyticsChartData): CategoryRevenueSplitItem[] {
    return Array.isArray(data) ? (data as CategoryRevenueSplitItem[]) : [];
  }

  private normalizeFunnelItems(data: AnalyticsChartData): ConversionFunnelItem[] {
    return Array.isArray(data) ? (data as ConversionFunnelItem[]) : [];
  }

  private normalizeProgressItems(data: AnalyticsChartData): AnalyticsChartProgressItem[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return (data as PerformanceBreakdownItem[]).map((item) => ({
      label: item.label,
      value: Math.max(0, Math.min(100, Math.abs(item.value))),
      displayValue: item.displayValue,
      tone: item.tone,
    }));
  }
}
