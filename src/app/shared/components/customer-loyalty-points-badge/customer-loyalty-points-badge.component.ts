import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export type LoyaltyPointsBadgeMode = 'compact' | 'detail';

@Component({
  selector: 'app-customer-loyalty-points-badge',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './customer-loyalty-points-badge.component.html',
  styleUrl: './customer-loyalty-points-badge.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerLoyaltyPointsBadgeComponent {
  readonly pointsEarned = input.required<number>();
  readonly rewardCost = input<number | null>(null);
  readonly mode = input<LoyaltyPointsBadgeMode>('compact');
  readonly loading = input(false);
  readonly disabled = input(false);
}
