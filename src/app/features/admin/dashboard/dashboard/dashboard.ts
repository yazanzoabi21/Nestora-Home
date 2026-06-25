import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { BestSellingProductsCardComponent } from '../../../../shared/ui/best-selling-products-card';
import { KpiCardComponent, KpiCardData } from '../../../../shared/ui/kpi-card';
import { RecentOrdersCardComponent } from '../../../../shared/ui/recent-orders-card';
import { RevenueOverviewChartComponent } from '../../../../shared/ui/revenue-overview-chart';
import { SalesCategoryChartComponent } from '../../../../shared/ui/sales-category-chart';
import { SalesOrdersChartComponent } from '../../../../shared/ui/sales-orders-chart';
import { SalesPerformanceCardComponent } from '../../../../shared/ui/sales-performance-card';
import { ExportReportComponent, ExportReportConfig } from '../../../../shared/ui/export-report';

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
    ExportReportComponent,
    TranslatePipe,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {

  readonly dashboardExportConfig: ExportReportConfig = {
    fileName: 'nestora-dashboard-report',
    reportTitle: 'Nestora Home - Dashboard Report',
    reportSubtitle: 'April 2026',
    sections: [
      {
        title: 'KPI Summary',
        headers: ['Metric', 'Value', 'Trend'],
        rows: [
          ['Total Revenue', '$891.4K', '+18.4%'],
          ['Total Orders', '6.8K', '+12.2%'],
          ['Total Customers', '14.3K', '+8.6%'],
          ['Active Products', '524', '-2.1%'],
        ],
      },
      {
        title: 'Recent Orders',
        headers: ['Order ID', 'Customer', 'Date', 'Total', 'Payment', 'Delivery'],
        rows: [
          ['ORD-8821', 'Sophie Barrett', '22 Apr 2026', '$248.97', 'Paid', 'Delivered'],
          ['ORD-8820', 'Marcus Hunt', '22 Apr 2026', '$89.99', 'Paid', 'Shipped'],
          ['ORD-8819', 'Clara Morel', '21 Apr 2026', '$387.45', 'Paid', 'Processing'],
          ['ORD-8818', 'James Thornton', '21 Apr 2026', '$124.98', 'Pending', 'Processing'],
          ['ORD-8817', 'Anya Patel', '20 Apr 2026', '$312.96', 'Paid', 'Delivered'],
          ['ORD-8816', 'Luca Rossi', '20 Apr 2026', '$149.99', 'Refunded', 'Returned'],
        ],
      },
      {
        title: 'Best Selling Products',
        headers: ['Product', 'Trend', 'Sold'],
        rows: [
          ['Eco Cleaning Kit Bundle', '+24%', '1,203 sold'],
          ['Bamboo Cutting Board', '+18%', '876 sold'],
          ['Linen Tea Towel Set', '+12%', '892 sold'],
          ["Stainless Chef's Knife", '+8%', '703 sold'],
          ['Nordic Ceramic Bowl Set', '-4%', '567 sold'],
        ],
      },
    ],
  };

  selectMonth(): void {
    // TODO: Add month filter behavior.
  }

  exportReport(): void {
    // TODO: Add report export behavior.
  }

  readonly kpiCards: KpiCardData[] = [
    {
      title: 'Total Revenue',
      titleKey: 'DASHBOARD.TOTAL_REVENUE',
      value: '$891.4K',
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
      titleKey: 'DASHBOARD.TOTAL_ORDERS',
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
      titleKey: 'DASHBOARD.TOTAL_CUSTOMERS',
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
      titleKey: 'DASHBOARD.ACTIVE_PRODUCTS',
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
