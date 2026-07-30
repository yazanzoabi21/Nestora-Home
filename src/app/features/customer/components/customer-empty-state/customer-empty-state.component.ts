import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

export type CustomerEmptyStateVariant = 'deals' | 'wishlist' | 'orders' | 'search' | 'generic';

@Component({
  selector: 'app-customer-empty-state',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './customer-empty-state.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerEmptyStateComponent {
  readonly variant = input<CustomerEmptyStateVariant>('generic');
  readonly titleKey = input.required<string>();
  readonly descriptionKey = input.required<string>();
  readonly actionLabelKey = input<string | null>(null);
  readonly actionRouterLink = input<string | null>(null);
  readonly accessibleLabelKey = input<string | null>(null);
}
