import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DashboardCardAction } from './dashboard-card.model';

@Component({
  selector: 'app-dashboard-card',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './dashboard-card.html',
  styleUrl: './dashboard-card.css',
})
export class DashboardCard {
  readonly title = input.required<string>();
  readonly titleKey = input<string | null>(null);

  readonly subtitle = input<string | null>(null);
  readonly subtitleKey = input<string | null>(null);

  readonly filters = input<string[]>([]);
  readonly activeFilter = input<string | null>(null);
  readonly filterLabelPrefix = input<string | null>(null);

  readonly action = input<DashboardCardAction | null>(null);
  readonly padded = input(true);
  readonly loading = input(false);

  readonly filterChange = output<string>();
  readonly actionClick = output<void>();

  filterLabelKey(filter: string): string {
    return `${this.filterLabelPrefix()}.${filter.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}`;
  }

  selectFilter(filter: string): void {
    if (this.loading()) {
      return;
    }

    this.filterChange.emit(filter);
  }
}
