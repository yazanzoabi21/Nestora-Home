import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { HighchartsChartComponent } from 'highcharts-angular';
import type { Options } from 'highcharts';

@Component({
  selector: 'app-revenue-overview-chart',
  standalone: true,
  imports: [HighchartsChartComponent, TranslatePipe],
  templateUrl: './revenue-overview-chart.component.html',
  styleUrl: './revenue-overview-chart.component.css',
})
export class RevenueOverviewChartComponent {
  readonly filters = ['7D', '30D', '3M', '12M'];

  readonly chartOptions: Options = {
    chart: {
      type: 'line',
      height: 315,
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
      categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      lineColor: '#eee8df',
      tickLength: 0,
      labels: { style: { color: '#8d877e', fontSize: '12px' } },
    },
    yAxis: {
      title: { text: undefined },
      gridLineColor: '#eee8df',
      gridLineDashStyle: 'Dash',
      labels: {
        style: { color: '#8d877e', fontSize: '12px' },
        format: '£{value}k',
      },
    },
    tooltip: {
      borderColor: '#e5ded2',
      borderRadius: 12,
      shadow: false,
      valuePrefix: '£',
      valueSuffix: 'k',
    },
    plotOptions: {
      series: {
        marker: {
          enabled: false,
          symbol: 'circle',
        },
        lineWidth: 3,
      },
    },
    series: [
      {
        type: 'line',
        name: 'Revenue',
        color: '#5f6f43',
        data: [42, 48, 54, 51, 64, 72, 69, 78, 84, 91, 96, 104],
      },
      {
        type: 'line',
        name: 'Target',
        color: '#d9cab8',
        dashStyle: 'Dash',
        data: [40, 45, 50, 55, 60, 66, 70, 74, 80, 86, 92, 98],
      },
    ],
  };
}
