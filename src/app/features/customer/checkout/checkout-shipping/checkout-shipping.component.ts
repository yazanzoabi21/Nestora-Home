import { ChangeDetectionStrategy, Component, OnInit, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CheckoutSelectOption, CheckoutShippingInformation } from '../models';
import { CheckoutFormFieldComponent } from '../shared/checkout-form-field';

type ShippingForm = FormGroup<{
  firstName: FormControl<string>;
  lastName: FormControl<string>;
  email: FormControl<string>;
  phone: FormControl<string>;
  streetAddress: FormControl<string>;
  addressLine2: FormControl<string>;
  city: FormControl<string>;
  stateProvince: FormControl<string>;
  postalCode: FormControl<string>;
  country: FormControl<string>;
  deliveryInstructions: FormControl<string>;
}>;

type ShippingFormControlName = keyof ShippingForm['controls'];

@Component({
  selector: 'app-checkout-shipping',
  standalone: true,
  imports: [ReactiveFormsModule, CheckoutFormFieldComponent],
  templateUrl: './checkout-shipping.component.html',
  styleUrl: './checkout-shipping.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutShippingComponent implements OnInit {
  readonly initialValue = input<CheckoutShippingInformation | null>(null);
  readonly continue = output<CheckoutShippingInformation>();

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
    streetAddress: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    addressLine2: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    stateProvince: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    postalCode: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    country: new FormControl('Lebanon', { nonNullable: true, validators: [Validators.required] }),
    deliveryInstructions: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    const value = this.initialValue();
    if (value) {
      this.form.patchValue({
        ...value,
        phone: value.phone ?? '',
        addressLine2: value.addressLine2 ?? '',
        deliveryInstructions: value.deliveryInstructions ?? '',
      });
    }
  }

  error(name: ShippingFormControlName): string | null {
    const control = this.form.controls[name];
    if (!control.invalid || (!control.touched && !this.hasSubmitted)) return null;
    if (control.hasError('email')) return 'Enter a valid email address.';
    return 'This field is required.';
  }

  submit(): void {
    this.hasSubmitted = true;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.continue.emit({
      ...value,
      phone: value.phone.trim() || null,
      addressLine2: value.addressLine2.trim() || null,
      deliveryInstructions: value.deliveryInstructions.trim() || null,
    });
  }
}
