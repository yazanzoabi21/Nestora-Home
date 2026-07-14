import { ChangeDetectionStrategy, Component, OnInit, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CheckoutSelectOption, ShippingInformation } from '../checkout.models';
import { CheckoutFormFieldComponent } from '../shared/checkout-form-field';

type ShippingForm = FormGroup<{
  firstName: FormControl<string>;
  lastName: FormControl<string>;
  email: FormControl<string>;
  phone: FormControl<string>;
  address: FormControl<string>;
  city: FormControl<string>;
  state: FormControl<string>;
  postalCode: FormControl<string>;
  country: FormControl<string>;
}>;

@Component({
  selector: 'app-checkout-shipping',
  standalone: true,
  imports: [ReactiveFormsModule, CheckoutFormFieldComponent],
  templateUrl: './checkout-shipping.component.html',
  styleUrl: './checkout-shipping.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutShippingComponent implements OnInit {
  readonly initialValue = input<ShippingInformation | null>(null);
  readonly continue = output<ShippingInformation>();

  private hasSubmitted = false;

  readonly countries: CheckoutSelectOption[] = [
    { label: 'Lebanon', value: 'Lebanon' },
    { label: 'United States', value: 'United States' },
    { label: 'United Kingdom', value: 'United Kingdom' },
    { label: 'United Arab Emirates', value: 'United Arab Emirates' },
  ];

  readonly form: ShippingForm = new FormGroup({
    firstName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    lastName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    phone: new FormControl('', { nonNullable: true }),
    address: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    city: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    state: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    postalCode: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    country: new FormControl('Lebanon', { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    const value = this.initialValue();
    if (value) this.form.patchValue(value);
  }

  error(name: keyof ShippingInformation): string | null {
    const control = this.form.controls[name];
    if (!control.invalid || (!control.touched && !this.hasSubmitted)) return null;
    if (control.hasError('email')) return 'Enter a valid email address.';
    return 'This field is required.';
  }

  submit(): void {
    this.hasSubmitted = true;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.continue.emit(this.form.getRawValue());
  }
}
