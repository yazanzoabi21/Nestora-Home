import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';

import { PaymentMethod } from '../../../../data-access';
import { CheckoutFormFieldComponent } from '../shared/checkout-form-field';

@Component({
  selector: 'app-checkout-payment',
  standalone: true,
  imports: [CurrencyPipe, CheckoutFormFieldComponent],
  templateUrl: './checkout-payment.component.html',
  styleUrl: './checkout-payment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPaymentComponent {
  readonly methods = input.required<PaymentMethod[]>();
  readonly selectedId = input<string | null>(null);
  readonly totalLabel = input.required<string>();
  readonly reference = input('');
  readonly submitting = input(false);
  readonly select = output<string>();
  readonly referenceChange = output<string>();
  readonly back = output<void>();
  readonly placeOrder = output<void>();

  readonly referenceControl = new FormControl('', { nonNullable: true });

  constructor() {
    this.referenceControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.referenceChange.emit(value));

    effect(() => {
      const value = this.reference();
      if (this.referenceControl.value !== value) {
        this.referenceControl.setValue(value, { emitEvent: false });
      }
    });
  }

  selectedMethod(): PaymentMethod | null {
    return this.methods().find((method) => method.id === this.selectedId()) ?? null;
  }

  instructions(method: PaymentMethod): string | null {
    return method.instructions_en || method.description;
  }
}
