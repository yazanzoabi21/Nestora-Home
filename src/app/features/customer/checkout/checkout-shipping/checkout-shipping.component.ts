import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CheckoutSelectOption, CheckoutShippingInformation, CheckoutShippingPrefill } from '../models';
import { CheckoutFormFieldComponent } from '../shared/checkout-form-field';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
  imports: [ReactiveFormsModule, CheckoutFormFieldComponent, TranslatePipe],
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

  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly countries = signal<CheckoutSelectOption[]>([]);

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
    postalCode: new FormControl('', { nonNullable: true }),
    // country: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    country: new FormControl('Lebanon', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    deliveryInstructions: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.updateCountries();

    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateCountries());

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

      if (
        !initialValue &&
        !prefill &&
        this.appliedValueKey !== null
      ) {
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
      country: 'Lebanon',
      deliveryInstructions: '',
    };
  }

  error(name: ShippingFormControlName): string {
    const control = this.form.controls[name];

    if (
      !control.invalid ||
      (!control.touched && !this.hasSubmitted)
    ) {
      return '';
    }

    if (control.hasError('email')) {
      return this.translate.instant(
        'CUSTOMER.CHECKOUT.SHIPPING.ERRORS.INVALID_EMAIL',
      );
    }

    return this.translate.instant(
      'CUSTOMER.CHECKOUT.SHIPPING.ERRORS.REQUIRED',
    );
  }

  private updateCountries(): void {
    this.countries.set([
      {
        label: this.translate.instant(
          'CUSTOMER.CHECKOUT.SHIPPING.COUNTRIES.LEBANON',
        ),
        value: 'Lebanon',
      },
    ]);
  }

  submit(): void {
    this.hasSubmitted = true;
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();

    this.continue.emit({
      ...value,
      phone: value.phone.trim() || null,
      addressLine2: value.addressLine2.trim() || null,
      postalCode: value.postalCode.trim() || null,
      deliveryInstructions:
        value.deliveryInstructions.trim() || null,
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

  private toFormValue(
    value: CheckoutShippingInformation,
  ): Record<ShippingFormControlName, string> {
    return {
      firstName: value.firstName,
      lastName: value.lastName,
      email: value.email,
      phone: value.phone ?? '',
      streetAddress: value.streetAddress,
      addressLine2: value.addressLine2 ?? '',
      city: value.city,
      stateProvince: value.stateProvince,
      postalCode: value.postalCode ?? '',
      country: value.country?.trim() || 'Lebanon',
      deliveryInstructions:
        value.deliveryInstructions ?? '',
    };
  }
}
