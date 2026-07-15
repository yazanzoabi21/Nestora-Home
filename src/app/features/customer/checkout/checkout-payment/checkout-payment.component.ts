import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { CheckoutPaymentMethod } from '../models';

@Component({
  selector: 'app-checkout-payment',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './checkout-payment.component.html',
  styleUrl: './checkout-payment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPaymentComponent {
  readonly methods = input.required<readonly CheckoutPaymentMethod[]>();
  readonly selectedId = input<string | null>(null);
  readonly totalLabel = input.required<string>();
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly placeOrderError = input<string | null>(null);
  readonly submitting = input(false);
  readonly canPlaceOrder = input(false);
  readonly select = output<string>();
  readonly back = output<void>();
  readonly placeOrder = output<void>();

  selectedMethod(): CheckoutPaymentMethod | null {
    return this.methods().find((method) => method.id === this.selectedId()) ?? null;
  }

  instructions(method: CheckoutPaymentMethod): string | null {
    return method.instructionsEn || method.description;
  }

  providerRequired(): boolean {
    return this.selectedMethod()?.type === 'online';
  }
}
