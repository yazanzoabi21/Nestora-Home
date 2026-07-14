import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { DeliveryOption } from '../checkout.models';

@Component({
  selector: 'app-checkout-delivery',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './checkout-delivery.component.html',
  styleUrl: './checkout-delivery.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutDeliveryComponent {
  readonly options = input.required<DeliveryOption[]>();
  readonly selectedId = input<string | null>(null);
  readonly loading = input(false);
  readonly select = output<string>();
  readonly back = output<void>();
  readonly continue = output<void>();
}
