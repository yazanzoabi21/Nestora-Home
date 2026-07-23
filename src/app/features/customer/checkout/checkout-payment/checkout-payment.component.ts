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

import { CheckoutPaymentMethod } from '../models';


@Component({
  selector: 'app-checkout-payment',
  standalone: true,
  imports: [
    CurrencyPipe,
    TranslatePipe,
    NgClass
  ],
  templateUrl: './checkout-payment.component.html',
  styleUrl: './checkout-payment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPaymentComponent {
  private readonly translate = inject(TranslateService);

  readonly methods =
    input.required<readonly CheckoutPaymentMethod[]>();

  readonly selectedId = input<string | null>(null);

  // Replace totalLabel with the numeric total.
  readonly total = input.required<number>();

  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly placeOrderError = input<string | null>(null);
  readonly submitting = input(false);
  readonly canPlaceOrder = input(false);

  readonly select = output<string>();
  readonly back = output<void>();
  readonly placeOrder = output<void>();

  selectedMethod(): CheckoutPaymentMethod | null {
    return (
      this.methods().find(
        (method) => method.id === this.selectedId(),
      ) ?? null
    );
  }

  methodName(method: CheckoutPaymentMethod): string {
    if (this.isCashOnDelivery(method)) {
      return this.translate.instant(
        'CUSTOMER.CHECKOUT.PAYMENT.METHODS.COD.NAME',
      );
    }

    return method.name;
  }

  instructions(
    method: CheckoutPaymentMethod,
  ): string | null {
    const isArabic =
      this.translate.currentLang() === 'ar';

    if (this.isCashOnDelivery(method)) {
      const translatedDescription =
        this.translate.instant(
          'CUSTOMER.CHECKOUT.PAYMENT.METHODS.COD.DESCRIPTION',
        );

      return (
        (isArabic
          ? method.instructionsAr
          : method.instructionsEn) ||
        translatedDescription
      );
    }

    return (
      (isArabic
        ? method.instructionsAr
        : method.instructionsEn) ||
      method.description ||
      null
    );
  }

  providerRequired(): boolean {
    return this.selectedMethod()?.type === 'online';
  }

  private isCashOnDelivery(
    method: CheckoutPaymentMethod,
  ): boolean {
    return method.code?.trim().toLowerCase() === 'cod';
  }
}