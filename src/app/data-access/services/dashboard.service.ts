import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/services';
import { AnalyticsChartConfig } from '../../shared/ui/analytics-chart';
import { KpiCardData } from '../../shared/ui/kpi-card';

export type DashboardTrendType = 'up' | 'down';
export type DashboardTone = 'positive' | 'negative';

export interface PerformanceMetric {
    label: string;
    labelKey: string;
    value: string;
    change: string;
    tone: DashboardTone;
}

export interface RecentOrder {
    id: string;
    customer: string;
    email: string;
    date: string;
    total: string;
    payment: string;
    delivery: string;
}

export interface BestSellingProduct {
    rank: number;
    name: string;
    trend: string;
    trendType: DashboardTrendType;
    sold: string;
    progress: number;
}

export interface DashboardStatisticsRow {
    id: string;
    period_key: string;
    period_label: string;
    start_date: string;
    end_date: string;

    kpi_cards: KpiCardData[];
    revenue_overview_chart: {
        categories: string[];
        revenue: number[];
        target: number[];
    };
    sales_orders_chart: {
        categories: string[];
        revenue: number[];
        orders: number[];
    };
    sales_category_chart: {
        name: string;
        nameKey?: string | null;
        value: number;
        color: string;
    }[];
    sales_performance_card: PerformanceMetric[];
    recent_orders_card: RecentOrder[];
    best_selling_products_card: BestSellingProduct[];

    missing_notes: string[];
    generated_at: string;
}

@Injectable({
    providedIn: 'root',
})
export class DashboardService {
    private readonly supabase = inject(SupabaseService).client;

    async refreshStatistics(periodKey: string): Promise<DashboardStatisticsRow> {
        const { data, error } = await this.supabase.rpc('refresh_dashboard_statistics', {
            p_period_key: periodKey,
        });

        if (error) {
            throw error;
        }

        return data as DashboardStatisticsRow;
    }
}