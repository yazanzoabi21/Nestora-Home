import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

interface PerformanceMetric {
  label: string;
  labelKey: string;
  value: string;
  change: string;
  tone: 'positive' | 'negative';
}

@Component({
  selector: 'app-sales-performance-card',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './sales-performance-card.component.html',
  styleUrl: './sales-performance-card.component.css',
})
export class SalesPerformanceCardComponent {
  readonly metrics: PerformanceMetric[] = [
    {
      label: 'Avg. Order Value',
      labelKey: 'DASHBOARD.AVG_ORDER_VALUE',
      value: '£130.50',
      change: '+5.8%',
      tone: 'positive',
    },
    {
      label: 'Conversion Rate',
      labelKey: 'DASHBOARD.CONVERSION_RATE',
      value: '4.28%',
      change: '+0.62%',
      tone: 'positive',
    },
    {
      label: 'Return Rate',
      labelKey: 'DASHBOARD.RETURN_RATE',
      value: '3.4%',
      change: '-1.2%',
      tone: 'positive',
    },
    {
      label: 'Cart Abandon',
      labelKey: 'DASHBOARD.CART_ABANDON',
      value: '62.1%',
      change: '+2.3%',
      tone: 'negative',
    },
  ];
}
