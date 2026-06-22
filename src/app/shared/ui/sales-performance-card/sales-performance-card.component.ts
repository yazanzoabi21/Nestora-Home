import { Component } from '@angular/core';

interface PerformanceMetric {
  label: string;
  value: string;
  change: string;
  tone: 'positive' | 'negative';
}

@Component({
  selector: 'app-sales-performance-card',
  standalone: true,
  templateUrl: './sales-performance-card.component.html',
  styleUrl: './sales-performance-card.component.css',
})
export class SalesPerformanceCardComponent {
  readonly metrics: PerformanceMetric[] = [
    {
      label: 'Avg. Order Value',
      value: '£130.50',
      change: '+5.8% vs last month',
      tone: 'positive',
    },
    {
      label: 'Conversion Rate',
      value: '4.28%',
      change: '+0.62% vs last month',
      tone: 'positive',
    },
    {
      label: 'Return Rate',
      value: '3.4%',
      change: '-1.2% vs last month',
      tone: 'positive',
    },
    {
      label: 'Cart Abandon',
      value: '62.1%',
      change: '+2.3% vs last month',
      tone: 'negative',
    },
  ];
}
