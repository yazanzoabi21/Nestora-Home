export type AnalyticsTone = 'positive' | 'negative' | 'neutral';

export interface AnalyticsKpiCard {
  icon: string;
  title: string;
  value: string;
  change: string;
  changeLabel: string;
  tone: AnalyticsTone;
}

export interface RevenueGrowthChartData {
  labels: string[];
  revenue: number[];
  target?: number[];
}

export interface CustomerGrowthChartData {
  labels: string[];
  newCustomers: number[];
  returningCustomers: number[];
}

export interface CategoryRevenueSplitItem {
  label: string;
  value: number;
}

export interface ConversionFunnelItem {
  step: number;
  label: string;
  value: number;
  percentage: number;
  dropOff: number | string | null;
}

export interface WeeklySalesPatternData {
  labels: string[];
  revenue: number[];
}

export interface PerformanceBreakdownItem {
  label: string;
  value: number;
  displayValue: string;
  tone: AnalyticsTone;
}

export interface AnalyticsRow {
  id: string;
  period_key: string;
  period_label: string;
  start_date: string;
  end_date: string;
  kpi_cards: AnalyticsKpiCard[];
  revenue_growth_chart: RevenueGrowthChartData;
  customer_growth_chart: CustomerGrowthChartData;
  category_revenue_split: CategoryRevenueSplitItem[];
  conversion_funnel: ConversionFunnelItem[];
  weekly_sales_pattern: WeeklySalesPatternData;
  performance_breakdown: PerformanceBreakdownItem[];
  created_at: string;
  updated_at: string;
}
