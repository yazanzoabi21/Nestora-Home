import type { Options } from 'highcharts';
import {
  CategoryRevenueSplitItem,
  ConversionFunnelItem,
  CustomerGrowthChartData,
  PerformanceBreakdownItem,
  RevenueGrowthChartData,
  WeeklySalesPatternData,
} from '../../../data-access/models/analytics.model';

export type AnalyticsChartType = 'line' | 'bar' | 'doughnut' | 'funnel' | 'progress';

export type AnalyticsChartData =
  | RevenueGrowthChartData
  | CustomerGrowthChartData
  | CategoryRevenueSplitItem[]
  | ConversionFunnelItem[]
  | WeeklySalesPatternData
  | PerformanceBreakdownItem[]
  | null
  | undefined;

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

export interface AnalyticsChartProgressItem {
  label: string;
  value: number;
  displayValue: string;
  tone?: 'positive' | 'negative' | 'neutral';
}
