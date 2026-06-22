import { Component, Input } from '@angular/core';
import { HighchartsChartComponent } from 'highcharts-angular';
import type { Options } from 'highcharts';

export interface KpiCardData {
  title: string;
  value: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  trend: string;
  trendType: 'up' | 'down';
  trendColor: string;
  chartColor: string;
  chartData: number[];
}

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [HighchartsChartComponent],
  templateUrl: './kpi-card.component.html',
  styleUrl: './kpi-card.component.css',
})
export class KpiCardComponent {
  @Input({ required: true }) data!: KpiCardData;

  get chartOptions(): Options {
    return {
      chart: {
        backgroundColor: 'transparent',
        height: 28,
        margin: [2, 0, 2, 0],
        spacing: [0, 0, 0, 0],
        type: 'line',
      },
      title: {
        text: undefined,
      },
      credits: {
        enabled: false,
      },
      legend: {
        enabled: false,
      },
      tooltip: {
        enabled: false,
      },
      xAxis: {
        visible: false,
      },
      yAxis: {
        visible: false,
      },
      plotOptions: {
        series: {
          animation: false,
          enableMouseTracking: false,
          lineWidth: 2,
          marker: {
            enabled: false,
          },
          states: {
            hover: {
              enabled: false,
            },
          },
        },
      },
      series: [
        {
          type: 'line',
          data: this.data.chartData,
          color: this.data.chartColor,
        },
      ],
    };
  }
}
