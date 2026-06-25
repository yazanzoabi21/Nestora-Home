import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { HighchartsChartComponent } from 'highcharts-angular';
import type { Options } from 'highcharts';

@Component({
  selector: 'app-sales-orders-chart',
  standalone: true,
  imports: [HighchartsChartComponent, TranslatePipe],
  templateUrl: './sales-orders-chart.component.html',
  styleUrl: './sales-orders-chart.component.css',
})
export class SalesOrdersChartComponent {
  readonly filters = ['7D', '30D', '3M'];

  readonly chartOptions: Options = {
    chart: {
      type: 'column',
      height: 320,
      backgroundColor: 'transparent',
      spacing: [12, 8, 8, 0],
    },
    title: { text: undefined },
    credits: { enabled: false },
    legend: {
      align: 'center',
      verticalAlign: 'bottom',
      itemStyle: {
        color: '#5f6f43',
        fontSize: '13px',
        fontWeight: '600',
      },
    },
    xAxis: {
      categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      lineColor: '#eee8df',
      tickLength: 0,
      labels: { style: { color: '#8d877e', fontSize: '12px' } },
    },
    yAxis: [
      {
        title: { text: undefined },
        gridLineColor: '#eee8df',
        gridLineDashStyle: 'Dash',
        labels: {
          style: { color: '#8d877e', fontSize: '12px' },
          format: '${value}k',
        },
      },
      {
        title: { text: undefined },
        opposite: true,
        gridLineWidth: 0,
        labels: {
          style: { color: '#8d877e', fontSize: '12px' },
        },
      },
    ],
    tooltip: {
      borderColor: '#e5ded2',
      borderRadius: 12,
      shadow: false,
    },
    plotOptions: {
      column: {
        borderWidth: 0,
        borderRadius: 7,
        pointPadding: 0.2,
        groupPadding: 0.18,
      },
    },
    series: [
      {
        type: 'column',
        name: 'Revenue',
        color: '#5f6f43',
        data: [8, 9.2, 11.1, 10.6, 15, 18, 12.8],
      },
      {
        type: 'column',
        name: 'Orders',
        color: '#e7d9c9',
        yAxis: 1,
        data: [62, 72, 85, 78, 112, 135, 96],
      },
    ],
  };
}
