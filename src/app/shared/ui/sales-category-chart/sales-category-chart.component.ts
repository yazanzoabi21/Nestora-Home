import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { HighchartsChartComponent } from 'highcharts-angular';
import type { Options } from 'highcharts';

@Component({
  selector: 'app-sales-category-chart',
  standalone: true,
  imports: [HighchartsChartComponent, TranslatePipe],
  templateUrl: './sales-category-chart.component.html',
  styleUrl: './sales-category-chart.component.css',
})
export class SalesCategoryChartComponent {
  readonly categories = [
    { name: 'Kitchen Tools', nameKey: 'DASHBOARD.KITCHEN_TOOLS', value: 32, color: '#5f6f43' },
    { name: 'Cookware', nameKey: 'DASHBOARD.COOKWARE', value: 24, color: '#d9cab8' },
    { name: 'Home Accessories', nameKey: 'DASHBOARD.HOME_ACCESSORIES', value: 20, color: '#3b82f6' },
    { name: 'Cleaning', nameKey: 'DASHBOARD.CLEANING', value: 14, color: '#d97706' },
    { name: 'Smart Home', nameKey: 'DASHBOARD.SMART_HOME', value: 10, color: '#a855f7' },
  ];

  readonly chartOptions: Options = {
    chart: {
      type: 'pie',
      height: 280,
      backgroundColor: 'transparent',
      spacing: [0, 0, 0, 0],
    },
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    tooltip: {
      pointFormat: '<b>{point.y}%</b>',
      borderColor: '#e5ded2',
      borderRadius: 12,
      shadow: false,
    },
    plotOptions: {
      pie: {
        innerSize: '66%',
        borderWidth: 0,
        dataLabels: { enabled: false },
      },
    },
    series: [
      {
        type: 'pie',
        name: 'Sales',
        data: this.categories.map((category) => ({
          name: category.name,
          y: category.value,
          color: category.color,
        })),
      },
    ],
  };
}
