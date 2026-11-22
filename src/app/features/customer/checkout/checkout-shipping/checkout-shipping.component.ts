import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CheckoutShippingInformation, CheckoutShippingPrefill, CheckoutShippingSubmission } from '../models';
import { CustomerAddress } from '../../models';
import { CustomerAddressDeleteComponent } from '../../components/customer-address-delete/customer-address-delete.component';
import { CustomerLocationFieldsComponent } from '../../components/customer-location-fields/customer-location-fields.component';
import { CheckoutFormFieldComponent } from '../shared/checkout-form-field';
import { TranslatePipe } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { checkoutPhoneError, normalizeCheckoutPhone } from '../checkout-phone';

const requiredText = Validators.pattern(/\S/);

type ShippingForm = FormGroup<{
  firstName: FormControl<string>;
  lastName: FormControl<string>;
  email: FormControl<string>;
  phone: FormControl<string>;
  streetAddress: FormControl<string>;
  addressLine2: FormControl<string>;
  deliveryInstructions: FormControl<string>;
}>;

type ShippingFormControlName = keyof ShippingForm['controls'];

@Component({
  selector: 'app-checkout-shipping',
  standalone: true,
  imports: [ReactiveFormsModule, CheckoutFormFieldComponent, CustomerLocationFieldsComponent, CustomerAddressDeleteComponent, TranslatePipe],
  templateUrl: './checkout-shipping.component.html',
  styleUrl: './checkout-shipping.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutShippingComponent {
  readonly initialValue = input<CheckoutShippingInformation | null>(null);
  readonly prefill = input<CheckoutShippingPrefill | null>(null);
  readonly authenticated = input(false);
  readonly addresses = input<readonly CustomerAddress[]>([]);
  readonly addressesLoading = input(false);
  readonly addressesError = input<string | null>(null);
  readonly selectedAddressId = input<string | null>(null);
  readonly initialSaveForFuture = input(false);
  readonly initialAddressLabel = input('Home');
  readonly shippingEdit = output<void>();
  readonly addressSelect = output<string>();
  readonly addressRemoved = output<string>();
  readonly newAddress = output<void>();
  readonly continue = output<CheckoutShippingSubmission>();

  readonly hasSubmitted = signal(false);
  private readonly phoneField = viewChild('phoneField', { read: ElementRef<HTMLElement> });
  private readonly locationFields = viewChild(CustomerLocationFieldsComponent);
  readonly initialLocation = linkedSignal(() => {
    const value = this.initialValue();
    return value ? { ...value, province: value.stateProvince } : null;
  });
  private appliedValue: CheckoutShippingInformation | null = null;

  private readonly destroyRef = inject(DestroyRef);

  readonly saveForFuture = new FormControl(false, { nonNullable: true });
  readonly addressLabel = new FormControl('Home', {
    nonNullable: true,
    validators: [Validators.required, requiredText, Validators.maxLength(40)],
  });

  readonly form: ShippingForm = new FormGroup({
    firstName: new FormControl('', { nonNullable: true, validators: [Validators.required, requiredText] }),
    lastName: new FormControl('', { nonNullable: true, validators: [Validators.required, requiredText] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [(control) => {
        const error = checkoutPhoneError(control.value);
        return error ? { [error]: true } : null;
      }],
    }),
    streetAddress: new FormControl('', { nonNullable: true, validators: [Validators.required, requiredText] }),
    addressLine2: new FormControl('', { nonNullable: true }),
    deliveryInstructions: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.shippingEdit.emit();
    });
    this.saveForFuture.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.shippingEdit.emit();
    });
    this.addressLabel.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.shippingEdit.emit();
    });

    effect(() => {
      const initialValue = this.initialValue();
      const prefill = this.prefill();
      if (initialValue !== this.appliedValue) {
        this.resetForm(initialValue ? this.toFormValue(initialValue) : this.emptyFormValue());
        this.appliedValue = initialValue;
        this.saveForFuture.setValue(this.initialSaveForFuture(), { emitEvent: false });
        this.addressLabel.setValue(this.initialAddressLabel(), { emitEvent: false });
      }

      if (prefill) this.patchSafePrefill(initialValue ? { phone: prefill.phone } : prefill);
    });
  }

  private resetForm(
    value: Record<ShippingFormControlName, string>,
  ): void {
    this.form.reset(value, { emitEvent: false });
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.hasSubmitted.set(false);
  }

  private emptyFormValue(): Record<ShippingFormControlName, string> {
    return {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      streetAddress: '',
      addressLine2: '',
      deliveryInstructions: '',
    };
  }

  error(name: ShippingFormControlName): string {
    const control = this.form.controls[name];

    if (
      !control.invalid ||
      (!control.touched && !this.hasSubmitted())
    ) {
      return '';
    }

    if (name === 'phone') {
      return control.hasError('required')
        ? 'CUSTOMER.CHECKOUT.SHIPPING.ERRORS.PHONE_REQUIRED'
        : 'CUSTOMER.CHECKOUT.SHIPPING.ERRORS.INVALID_PHONE';
    }
    return control.hasError('email')
      ? 'CUSTOMER.CHECKOUT.SHIPPING.ERRORS.INVALID_EMAIL'
      : 'CUSTOMER.CHECKOUT.SHIPPING.ERRORS.REQUIRED';
  }

  submit(): void {
    this.hasSubmitted.set(true);
    this.form.markAllAsTouched();
    const { firstName, lastName, email, phone, streetAddress } = this.form.getRawValue();
    this.form.patchValue({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: normalizeCheckoutPhone(phone),
      streetAddress: streetAddress.trim(),
    }, { emitEvent: false });

    const location = this.locationFields()?.selection();
    if (!location || this.form.invalid || (this.saveForFuture.value && this.addressLabel.invalid)) {
      this.addressLabel.markAsTouched();
      if (this.form.controls.phone.invalid) this.phoneField()?.nativeElement.querySelector('input')?.focus();
      return;
    }

    const value = this.form.getRawValue();

    this.continue.emit({
      shippingInformation: {
        ...value,
        country: location.country,
        countryId: location.countryId,
        stateProvince: location.province,
        provinceId: location.provinceId,
        city: location.city,
        cityId: location.cityId,
        addressLine2: value.addressLine2.trim() || null,
        deliveryInstructions: value.deliveryInstructions.trim() || null,
      },
      saveForFuture: this.authenticated() && !this.selectedAddressId() && this.saveForFuture.value,
      addressLabel: this.addressLabel.value.trim() || 'Home',
    });
  }

  chooseAddress(id: string): void {
    this.saveForFuture.setValue(false, { emitEvent: false });
    this.addressSelect.emit(id);
  }

  chooseNewAddress(): void {
    this.saveForFuture.setValue(false, { emitEvent: false });
    this.resetForm(this.emptyFormValue());
    this.initialLocation.set(null);
    const prefill = this.prefill();
    if (prefill) this.patchSafePrefill(prefill);
    this.newAddress.emit();
  }

  private patchSafePrefill(prefill: CheckoutShippingPrefill): void {
    for (const [name, value] of Object.entries(prefill) as [ShippingFormControlName, string | undefined][]) {
      const nextValue = value?.trim();
      if (!nextValue) continue;

      const control = this.form.controls[name];
      if (!control || control.dirty || control.value.trim()) continue;

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
      deliveryInstructions:
        value.deliveryInstructions ?? '',
    };
  }
}
