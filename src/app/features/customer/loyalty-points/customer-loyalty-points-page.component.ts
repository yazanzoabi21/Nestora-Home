import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { LoyaltyTransactionType } from '../models';
import { CustomerLoyaltyPointsService } from '../services';

@Component({
  selector: 'app-customer-loyalty-points-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink, TranslatePipe],
  templateUrl: './customer-loyalty-points-page.component.html',
  styleUrl: './customer-loyalty-points-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerLoyaltyPointsPageComponent {
  readonly loyalty = inject(CustomerLoyaltyPointsService);
  readonly balance = this.loyalty.calculator.balance;
  readonly dollarEquivalent = computed(
    () => this.balance() * this.loyalty.calculator.settings().point_value_usd,
  );

  constructor() {
    void this.loyalty.load();
  }

  transactionLabelKey(type: LoyaltyTransactionType): string {
    switch (type) {
      case 'earn':
        return 'CUSTOMER.LOYALTY.HISTORY.TYPES.EARN';
      case 'redeem':
        return 'CUSTOMER.LOYALTY.HISTORY.TYPES.REDEEM';
      case 'earn_reversal':
        return 'CUSTOMER.LOYALTY.HISTORY.TYPES.EARN_REVERSAL';
      case 'redemption_refund':
        return 'CUSTOMER.LOYALTY.HISTORY.TYPES.REDEMPTION_REFUND';
      case 'adjustment':
        return 'CUSTOMER.LOYALTY.HISTORY.TYPES.ADJUSTMENT';
    }
  }

  orderStatusKey(status: string): string {
    return `CUSTOMER.ACCOUNT.ORDERS.STATUS.${status.trim().replace(/[\s-]+/g, '_').toUpperCase()}`;
  }
}
