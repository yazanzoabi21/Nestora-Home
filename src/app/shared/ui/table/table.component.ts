import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ui-table',
  standalone: true,
  templateUrl: './table.component.html',
  styleUrl: './table.component.scss',
})
export class TableComponent {}