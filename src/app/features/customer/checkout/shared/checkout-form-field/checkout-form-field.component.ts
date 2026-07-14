import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { CheckoutSelectOption, CheckoutTextControl } from '../../checkout.models';

@Component({
  selector: 'app-checkout-form-field',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './checkout-form-field.component.html',
  styleUrl: './checkout-form-field.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutFormFieldComponent {
  readonly label = input.required<string>();
  readonly control = input.required<CheckoutTextControl>();
  readonly name = input.required<string>();
  readonly type = input<'text' | 'email' | 'tel' | 'select'>('text');
  readonly placeholder = input('');
  readonly autocomplete = input('');
  readonly required = input(false);
  readonly disabled = input(false);
  readonly fullWidth = input(false);
  readonly options = input<CheckoutSelectOption[]>([]);
  readonly error = input<string | null>(null);
}
