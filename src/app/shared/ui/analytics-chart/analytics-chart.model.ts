import type { Options } from 'highcharts';

export interface AnalyticsChartLegendItem {
  name: string;
  nameKey?: string;
  value?: string | number;
  suffix?: string;
  color?: string;
}

export interface AnalyticsChartConfig {
  title: string;
  titleKey?: string;
  subtitle?: string;
  subtitleKey?: string;

  filters?: string[];
  activeFilter?: string;

  height?: number;
  chartOptions: Options;

  legendItems?: AnalyticsChartLegendItem[];
}