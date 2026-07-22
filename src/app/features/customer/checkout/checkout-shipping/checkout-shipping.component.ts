import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CheckoutSelectOption, CheckoutShippingInformation, CheckoutShippingPrefill } from '../models';
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
export class CheckoutShippingComponent {
  readonly initialValue = input<CheckoutShippingInformation | null>(null);
  readonly prefill = input<CheckoutShippingPrefill | null>(null);
  readonly continue = output<CheckoutShippingInformation>();

  private hasSubmitted = false;
  private appliedValueKey: string | null = null;

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
    country: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    deliveryInstructions: new FormControl('', { nonNullable: true }),
  });

  constructor() {
  effect(() => {
    const initialValue = this.initialValue();
    const prefill = this.prefill();

    const initialEmail =
      initialValue?.email.trim().toLowerCase() ?? '';

    const prefillEmail =
      prefill?.email?.trim().toLowerCase() ?? '';

    const initialValueBelongsToCurrentCustomer =
      !!initialValue &&
      !!prefill &&
      !!initialEmail &&
      initialEmail === prefillEmail;

    /*
     * Keep the current checkout value when:
     * 1. There is no logged-in profile prefill, or
     * 2. The saved checkout email belongs to the same customer.
     */
    if (
      initialValue &&
      (!prefill || initialValueBelongsToCurrentCustomer)
    ) {
      const valueKey = `initial:${JSON.stringify(initialValue)}`;

      if (this.appliedValueKey === valueKey) {
        return;
      }

      this.resetForm(this.toFormValue(initialValue));
      this.appliedValueKey = valueKey;
      return;
    }

    /*
     * A profile prefill exists, but the previous checkout data
     * belongs to another email/customer.
     *
     * Clear all previous guest information before applying
     * the logged-in customer's profile.
     */
    if (prefill) {
      const valueKey = `prefill:${JSON.stringify(prefill)}`;

      if (this.appliedValueKey === valueKey) {
        return;
      }

      this.resetForm(this.emptyFormValue());
      this.patchSafePrefill(prefill);

      this.form.markAsPristine();
      this.form.markAsUntouched();
      this.hasSubmitted = false;

      this.appliedValueKey = valueKey;
      return;
    }

    /*
     * The parent cleared both values, for example after
     * completing an order.
     */
    if (!initialValue && !prefill && this.appliedValueKey !== null) {
      this.resetForm(this.emptyFormValue());
      this.appliedValueKey = null;
    }
  });
}

private resetForm(
  value: Record<ShippingFormControlName, string>,
): void {
  this.form.reset(value, { emitEvent: false });
  this.form.markAsPristine();
  this.form.markAsUntouched();
  this.hasSubmitted = false;
}

private emptyFormValue(): Record<ShippingFormControlName, string> {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    streetAddress: '',
    addressLine2: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    country: '',
    deliveryInstructions: '',
  };
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

  private patchSafePrefill(prefill: CheckoutShippingPrefill): void {
    for (const [name, value] of Object.entries(prefill) as Array<[ShippingFormControlName, string | undefined]>) {
      const nextValue = value?.trim();
      if (!nextValue) continue;

      const control = this.form.controls[name];
      if (!control || (!control.pristine && control.value.trim())) continue;

      control.patchValue(nextValue, { emitEvent: false });
      control.markAsPristine();
      control.markAsUntouched();
    }
  }

  private toFormValue(value: CheckoutShippingInformation): Record<ShippingFormControlName, string> {
    return {
      ...value,
      phone: value.phone ?? '',
      addressLine2: value.addressLine2 ?? '',
      deliveryInstructions: value.deliveryInstructions ?? '',
    };
  }
}
