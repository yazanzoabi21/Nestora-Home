import { CurrencyPipe, NgClass } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import {
  TranslatePipe,
  TranslateService,
} from '@ngx-translate/core';

import { CheckoutShippingMethod } from '../models';

@Component({
  selector: 'app-checkout-delivery',
  standalone: true,
  imports: [
    CurrencyPipe,
    NgClass,
    TranslatePipe,
  ],
  templateUrl: './checkout-delivery.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutDeliveryComponent {
  private readonly translate = inject(TranslateService);

  readonly options =
    input.required<readonly CheckoutShippingMethod[]>();

  readonly selectedId = input<string | null>(null);
  readonly loading = input(false);
  readonly error = input<string | null>(null);

  readonly select = output<string>();
  readonly back = output<void>();
  readonly continue = output<void>();

  eta(method: CheckoutShippingMethod): string {
    if (method.etaLabel?.trim()) {
      return method.etaLabel;
    }

    if (
      method.etaMinDays !== null &&
      method.etaMaxDays !== null
    ) {
      return this.translate.instant(
        'CUSTOMER.CHECKOUT.DELIVERY.ETA_RANGE',
        {
          min: method.etaMinDays,
          max: method.etaMaxDays,
        },
      );
    }

    if (method.etaMinDays !== null) {
      return this.translate.instant(
        'CUSTOMER.CHECKOUT.DELIVERY.ETA_MINIMUM',
        {
          min: method.etaMinDays,
        },
      );
    }

    return (
      method.description?.trim() ||
      this.translate.instant(
        'CUSTOMER.CHECKOUT.DELIVERY.ESTIMATED_AT_CHECKOUT',
      )
    );
  }
}