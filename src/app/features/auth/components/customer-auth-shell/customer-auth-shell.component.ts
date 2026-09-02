import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-customer-auth-shell',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './customer-auth-shell.component.html',
  styleUrl: './customer-auth-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerAuthShellComponent {
  readonly badgeKey = input.required<string>();
  readonly titleKey = input.required<string>();
  readonly descriptionKey = input.required<string>();
}
