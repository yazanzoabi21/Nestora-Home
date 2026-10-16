import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ui-chart-card',
  standalone: true,
  templateUrl: './chart-card.component.html',
  styleUrl: './chart-card.component.scss',
})
export class ChartCardComponent {}