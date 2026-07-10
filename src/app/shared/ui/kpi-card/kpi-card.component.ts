import { Component, Input, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { HighchartsChartComponent } from 'highcharts-angular';
import type { Options } from 'highcharts';
import { SkeletonModule } from 'primeng/skeleton';

export interface KpiCardData {
  title: string;
  titleKey?: string;
  subtitle?: string;
  subtitleKey?: string;
  subtitleColor?: string;
  value: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  trend?: string;
  trendType?: 'up' | 'down';
  trendColor?: string;
  chartColor?: string;
  chartData?: number[];
  showChart?: boolean;
}

type KpiCardVariant = 'default' | 'compact';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [HighchartsChartComponent, SkeletonModule, TranslatePipe],
  templateUrl: './kpi-card.component.html',
  styleUrl: './kpi-card.component.css',
})
export class KpiCardComponent {
  @Input() data?: KpiCardData;
  @Input() variant: KpiCardVariant = 'default';
  readonly loading = input(false);

  get isCompact(): boolean {
    return this.variant === 'compact';
  }

  get chartOptions(): Options {
    const data = this.data;

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
          data: data?.chartData ?? [],
          color: data?.chartColor,
        },
      ],
    };
  }

  get hasTrend(): boolean {
    return !!this.data?.trend && !!this.data?.trendType;
  }

  get shouldShowChart(): boolean {
    return this.data?.showChart !== false && !!this.data?.chartData?.length;
  }
}
