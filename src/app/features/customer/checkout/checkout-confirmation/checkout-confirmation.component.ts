import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CustomerAuthService } from '../../../../core/services/auth';
import { CheckoutConfirmation } from '../models';
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
  readonly isAuthenticated = inject(CustomerAuthService).isAuthenticated;
  readonly confirmation = input.required<CheckoutConfirmation | null>();
}
