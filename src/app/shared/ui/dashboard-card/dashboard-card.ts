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

  readonly action = input<DashboardCardAction | null>(null);
  readonly padded = input(true);

  readonly filterChange = output<string>();
  readonly actionClick = output<void>();

  selectFilter(filter: string): void {
    this.filterChange.emit(filter);
  }
}