import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/services';
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

    async refreshStatistics(signal?: AbortSignal): Promise<DashboardStatisticsRow> {
        const request = this.supabase.rpc('refresh_dashboard_statistics', {
            p_period_key: 'ALL',
        });
        const { data, error } = await (signal ? request.abortSignal(signal) : request);

        if (error) {
            throw error;
        }

        // PostgREST returns a row array for SETOF/table RPCs and an object for
        // scalar composite/JSON RPCs. A cast does not unwrap a row array.
        const response: unknown = data;
        const row: unknown = Array.isArray(response) && response.length === 1 ? response[0] : response;
        if (!isDashboardRow(row) || row.period_key !== 'ALL') {
            throw new Error('Invalid dashboard response or mismatched period');
        }
        return row;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDashboardRow(value: unknown): value is DashboardStatisticsRow {
    if (!isRecord(value)) return false;
    const validDate = (date: unknown): date is string => typeof date === 'string'
        && /^\d{4}-\d{2}-\d{2}/.test(date) && Number.isFinite(Date.parse(date));
    const isChart = (chart: unknown, series: string[]): boolean => isRecord(chart)
        && Array.isArray(chart['categories']) && chart['categories'].every((item: unknown) => typeof item === 'string')
        && series.every((key) => Array.isArray(chart[key])
            && chart[key].every((item: unknown) => typeof item === 'number' && Number.isFinite(item)));
    return typeof value['period_key'] === 'string'
        && validDate(value['start_date']) && validDate(value['end_date'])
        && value['start_date'] <= value['end_date']
        && ['kpi_cards', 'sales_category_chart', 'sales_performance_card', 'recent_orders_card', 'best_selling_products_card']
            .every((key) => Array.isArray(value[key]))
        && isChart(value['revenue_overview_chart'], ['revenue', 'target'])
        && isChart(value['sales_orders_chart'], ['revenue', 'orders']);
}
