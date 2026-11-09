import { AdminAuthService } from '../../../../core/services/auth';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { MessageService } from 'primeng/api';
import { provideHighcharts } from 'highcharts-angular';
import { SupabaseService } from '../../../../core/services';
import { DashboardService, DashboardStatisticsRow } from '../../../../data-access/services/dashboard.service';
import { Dashboard } from './dashboard';

// Empty transport contract only; no sample statistics, orders, products or customers.
function emptyResponse(): DashboardStatisticsRow {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: '', period_key: 'ALL', period_label: '', start_date: today, end_date: today,
    generated_at: new Date().toISOString(), missing_notes: [], kpi_cards: [],
    revenue_overview_chart: { categories: [], revenue: [], target: [] },
    sales_orders_chart: { categories: [], revenue: [], orders: [] },
    sales_category_chart: [], sales_performance_card: [], recent_orders_card: [], best_selling_products_card: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('Dashboard all-time RPC', () => {
  const rpc = vi.fn();
  beforeEach(() => {
    rpc.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }] });
  });

  it.each(['object', 'row array'])('requests ALL and unwraps the %s response', async (shape) => {
    const row = emptyResponse();
    rpc.mockResolvedValue({ data: shape === 'object' ? row : [row], error: null });
    expect(await TestBed.inject(DashboardService).refreshStatistics()).toEqual(row);
    expect(rpc).toHaveBeenCalledWith('refresh_dashboard_statistics', { p_period_key: 'ALL' });
  });

  it.each(['7D', '30D', '3M', '12M'])('rejects stale %s responses rather than labeling them all-time', async (period_key) => {
    rpc.mockResolvedValue({ data: { ...emptyResponse(), period_key }, error: null });
    await expect(TestBed.inject(DashboardService).refreshStatistics()).rejects.toThrow();
  });

  it.each([null, [], { period_key: 'ALL' }])('rejects missing or malformed results', async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(TestBed.inject(DashboardService).refreshStatistics()).rejects.toThrow();
  });

  it('preserves backend errors without falling back to a restricted period', async () => {
    const error = new Error('RPC failed');
    rpc.mockResolvedValue({ data: null, error });
    await expect(TestBed.inject(DashboardService).refreshStatistics()).rejects.toBe(error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('passes cancellation to the RPC request', async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: emptyResponse(), error: null });
    rpc.mockReturnValue({ abortSignal });
    const controller = new AbortController();
    await TestBed.inject(DashboardService).refreshStatistics(controller.signal);
    expect(abortSignal).toHaveBeenCalledWith(controller.signal);
  });
});

describe('Dashboard all-time state', () => {
  const load = vi.fn<DashboardService['refreshStatistics']>();
  beforeEach(async () => {
    load.mockReset().mockResolvedValue(emptyResponse());
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideTranslateService(), provideHighcharts({ instance: () => import('highcharts') }), MessageService,
        { provide: DashboardService, useValue: { refreshStatistics: load } },
        { provide: AdminAuthService, useValue: { currentUserProfile: () => null } },
      ],
    }).compileComponents();
  });

  it('automatically loads all-time data, removes period controls, and keeps exports', async () => {
    const fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
    const dashboard = fixture.componentInstance;
    expect(load).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(dashboard.revenueOverviewChart().filters).toBeUndefined();
    expect(dashboard.salesOrdersChart().filters).toBeUndefined();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('select')).toBeNull();
    expect(element.textContent).not.toMatch(/7D|30D|3M|12M|April 2026/);
    expect(element.querySelector('app-export-report')).not.toBeNull();
    expect(dashboard.dashboardExportConfig().reportSubtitle).toBe('DASHBOARD.ALL_TIME');
    expect(dashboard.loading()).toBe(false);
    expect(dashboard.errorMessage()).toBeNull();
  });

  it('maps every section to the same response, including empty results', async () => {
    const dashboard = TestBed.createComponent(Dashboard).componentInstance;
    await dashboard.loadDashboard();
    const row = dashboard.dashboardData()!;
    expect(dashboard.kpiCards()).toBe(row.kpi_cards);
    expect(dashboard.revenueOverviewChart().chartOptions.series?.[0]).toMatchObject({ data: row.revenue_overview_chart.revenue });
    expect(dashboard.salesOrdersChart().chartOptions.series?.[1]).toMatchObject({ data: row.sales_orders_chart.orders });
    expect(dashboard.performanceMetrics()).toBe(row.sales_performance_card);
    expect(dashboard.recentOrders()).toBe(row.recent_orders_card);
    expect(dashboard.bestSellingProducts()).toBe(row.best_selling_products_card);
  });

  it('cancels superseded requests and ignores late successes', async () => {
    const dashboard = TestBed.createComponent(Dashboard).componentInstance;
    const older = deferred<DashboardStatisticsRow>();
    const newer = deferred<DashboardStatisticsRow>();
    load.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const oldLoad = dashboard.loadDashboard();
    const oldSignal = load.mock.calls.at(-1)?.[0];
    const newLoad = dashboard.loadDashboard();
    expect(oldSignal?.aborted).toBe(true);
    expect(dashboard.dashboardData()).toBeNull();
    const latest = emptyResponse();
    newer.resolve(latest);
    await newLoad;
    older.resolve(emptyResponse());
    await oldLoad;
    expect(dashboard.dashboardData()).toBe(latest);
    expect(dashboard.loading()).toBe(false);
  });

  it('ignores late errors, clears failed data, and retries ALL', async () => {
    const dashboard = TestBed.createComponent(Dashboard).componentInstance;
    const older = deferred<DashboardStatisticsRow>();
    load.mockReturnValueOnce(older.promise);
    const oldLoad = dashboard.loadDashboard();
    await dashboard.loadDashboard();
    older.reject(new Error('Old failure'));
    await oldLoad;
    expect(dashboard.errorMessage()).toBeNull();
    load.mockRejectedValueOnce(new Error('Current failure'));
    await dashboard.loadDashboard();
    expect(dashboard.errorMessage()).toBe('DASHBOARD.LOAD_FAILED_DETAIL');
    expect(dashboard.dashboardData()).toBeNull();
    expect(dashboard.loading()).toBe(false);
    await dashboard.loadDashboard();
    expect(dashboard.dashboardData()?.period_key).toBe('ALL');
    expect(dashboard.errorMessage()).toBeNull();
  });

  it('cancels requests when the dashboard is destroyed', async () => {
    const fixture = TestBed.createComponent(Dashboard);
    const pending = deferred<DashboardStatisticsRow>();
    load.mockReturnValueOnce(pending.promise);
    const request = fixture.componentInstance.loadDashboard();
    const signal = load.mock.calls.at(-1)?.[0];
    fixture.destroy();
    expect(signal?.aborted).toBe(true);
    pending.resolve(emptyResponse());
    await request;
    expect(fixture.componentInstance.dashboardData()).toBeNull();
  });
});
