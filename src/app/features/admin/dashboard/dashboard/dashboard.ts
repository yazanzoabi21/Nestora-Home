import { Component } from '@angular/core';
import { BestSellingProductsCardComponent } from '../../../../shared/ui/best-selling-products-card';
import { KpiCardComponent, KpiCardData } from '../../../../shared/ui/kpi-card';
import { RecentOrdersCardComponent } from '../../../../shared/ui/recent-orders-card';
import { RevenueOverviewChartComponent } from '../../../../shared/ui/revenue-overview-chart';
import { SalesCategoryChartComponent } from '../../../../shared/ui/sales-category-chart';
import { SalesOrdersChartComponent } from '../../../../shared/ui/sales-orders-chart';
import { SalesPerformanceCardComponent } from '../../../../shared/ui/sales-performance-card';

@Component({
  selector: 'app-dashboard',
  imports: [
    BestSellingProductsCardComponent,
    KpiCardComponent,
    RecentOrdersCardComponent,
    RevenueOverviewChartComponent,
    SalesCategoryChartComponent,
    SalesOrdersChartComponent,
    SalesPerformanceCardComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  selectMonth(): void {
    // TODO: Add month filter behavior.
  }

  exportReport(): void {
    // TODO: Add report export behavior.
  }

  readonly kpiCards: KpiCardData[] = [
    {
      title: 'Total Revenue',
      value: '£891.4K',
      icon: 'pi pi-dollar',
      iconColor: '#5f6f43',
      iconBg: '#eef4e8',
      trend: '+18.4%',
      trendType: 'up',
      trendColor: '#5f6f43',
      chartColor: '#5f6f43',
      chartData: [18, 22, 20, 28, 26, 34, 31, 38, 42, 46],
    },
    {
      title: 'Total Orders',
      value: '6.8K',
      icon: 'pi pi-shopping-cart',
      iconColor: '#3b82f6',
      iconBg: '#eaf2ff',
      trend: '+12.2%',
      trendType: 'up',
      trendColor: '#3b82f6',
      chartColor: '#3b82f6',
      chartData: [12, 15, 14, 19, 22, 21, 25, 28, 27, 32],
    },
    {
      title: 'Total Customers',
      value: '14.3K',
      icon: 'pi pi-users',
      iconColor: '#a855f7',
      iconBg: '#f3e8ff',
      trend: '+8.6%',
      trendType: 'up',
      trendColor: '#a855f7',
      chartColor: '#a855f7',
      chartData: [24, 25, 28, 30, 29, 33, 35, 38, 40, 42],
    },
    {
      title: 'Active Products',
      value: '524',
      icon: 'pi pi-box',
      iconColor: '#d97706',
      iconBg: '#fff4df',
      trend: '-2.1%',
      trendType: 'down',
      trendColor: '#dc3f35',
      chartColor: '#d97706',
      chartData: [36, 35, 34, 36, 33, 32, 30, 31, 29, 28],
    },
  ];
}
