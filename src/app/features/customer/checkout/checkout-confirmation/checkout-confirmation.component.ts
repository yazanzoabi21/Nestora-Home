import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CustomerAuthService } from '../../../../core/services/auth';
import { CheckoutOrderSummaryComponent } from '../checkout-order-summary/checkout-order-summary.component';
import { CheckoutConfirmation } from '../models';

@Component({
  selector: 'app-checkout-confirmation',
  standalone: true,
  imports: [
    CurrencyPipe,
    RouterLink,
    TranslatePipe,
    CheckoutOrderSummaryComponent,
  ],
  templateUrl: './checkout-confirmation.component.html',
  styleUrl: './checkout-confirmation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutConfirmationComponent {
  readonly isAuthenticated =
    inject(CustomerAuthService).isAuthenticated;

  readonly confirmation =
    input.required<CheckoutConfirmation | null>();

  readonly pendingLoyaltyPoints = computed(
    () => this.confirmation()?.order.loyaltyPointsEarned ?? 0,
  );
}
