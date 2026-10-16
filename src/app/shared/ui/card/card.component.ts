import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ui-card',
  standalone: true,
  templateUrl: './card.component.html',
  styleUrl: './card.component.scss',
})
export class CardComponent {}