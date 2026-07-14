import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CheckoutConfirmation } from '../checkout.models';
import { CheckoutOrderSummaryComponent } from '../checkout-order-summary/checkout-order-summary.component';

@Component({
  selector: 'app-checkout-confirmation',
  standalone: true,
  imports: [CurrencyPipe, RouterLink, CheckoutOrderSummaryComponent],
  templateUrl: './checkout-confirmation.component.html',
  styleUrl: './checkout-confirmation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutConfirmationComponent {
  readonly confirmation = input.required<CheckoutConfirmation | null>();
}
