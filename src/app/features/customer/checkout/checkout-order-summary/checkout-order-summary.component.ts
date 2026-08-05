import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import {
  CheckoutOrderItem,
  CheckoutTotals,
} from '../models';

@Component({
  selector: 'app-checkout-order-summary',
  standalone: true,
  imports: [
    CurrencyPipe,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: './checkout-order-summary.component.html',
  styleUrl: './checkout-order-summary.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutOrderSummaryComponent {
  readonly items =
    input.required<readonly CheckoutOrderItem[]>();

  readonly totals =
    input.required<CheckoutTotals>();

  readonly loyaltyPoints = input(0);
  readonly authenticated = input(false);
  readonly cashOnDelivery = input(false);
}
