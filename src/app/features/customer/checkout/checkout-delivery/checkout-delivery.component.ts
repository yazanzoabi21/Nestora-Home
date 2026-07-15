import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { CheckoutShippingMethod } from '../models';

@Component({
  selector: 'app-checkout-delivery',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './checkout-delivery.component.html',
  styleUrl: './checkout-delivery.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutDeliveryComponent {
  readonly options = input.required<readonly CheckoutShippingMethod[]>();
  readonly selectedId = input<string | null>(null);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly select = output<string>();
  readonly back = output<void>();
  readonly continue = output<void>();

  eta(method: CheckoutShippingMethod): string {
    if (method.etaLabel) return method.etaLabel;
    if (method.etaMinDays !== null && method.etaMaxDays !== null) {
      return `${method.etaMinDays}-${method.etaMaxDays} days`;
    }
    if (method.etaMinDays !== null) return `${method.etaMinDays}+ days`;
    return method.description ?? 'Estimated at checkout';
  }
}
