import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { HighchartsChartComponent } from 'highcharts-angular';
import { AnalyticsChartConfig } from './analytics-chart.model';

@Component({
  selector: 'app-analytics-chart',
  standalone: true,
  imports: [HighchartsChartComponent, TranslatePipe],
  templateUrl: './analytics-chart.html',
  styleUrl: './analytics-chart.css',
})
export class AnalyticsChart {
  readonly config = input.required<AnalyticsChartConfig>();

  readonly filterChange = output<string>();

  selectFilter(filter: string): void {
    this.filterChange.emit(filter);
  }

  trackByFilter(index: number, filter: string): string {
    return filter;
  }

  trackByLegendItem(index: number, item: { name: string; nameKey?: string }): string {
    return item.nameKey || item.name;
  }
}