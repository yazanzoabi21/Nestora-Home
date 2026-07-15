import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { CheckoutOrderItem, CheckoutTotals } from '../models';

@Component({
  selector: 'app-checkout-order-summary',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './checkout-order-summary.component.html',
  styleUrl: './checkout-order-summary.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutOrderSummaryComponent {
  readonly items = input.required<readonly CheckoutOrderItem[]>();
  readonly totals = input.required<CheckoutTotals>();
}
