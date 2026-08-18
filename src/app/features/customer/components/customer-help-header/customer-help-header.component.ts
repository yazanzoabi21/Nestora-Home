import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-customer-help-header',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './customer-help-header.component.html',
  styleUrl: './customer-help-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerHelpHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
}
