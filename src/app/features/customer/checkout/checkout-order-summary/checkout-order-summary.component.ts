import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { CustomerCartLine } from '../../models';
import { CheckoutTotals } from '../checkout.models';

@Component({
  selector: 'app-checkout-order-summary',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './checkout-order-summary.component.html',
  styleUrl: './checkout-order-summary.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutOrderSummaryComponent {
  readonly lines = input.required<CustomerCartLine[]>();
  readonly totals = input.required<CheckoutTotals>();
}
