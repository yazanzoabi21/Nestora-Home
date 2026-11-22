import { ChangeDetectionStrategy, Component, effect, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { CustomerAddress, CustomerAddressInput } from '../../models';
import { CustomerLocationFieldsComponent } from '../customer-location-fields/customer-location-fields.component';

type AddressForm = FormGroup<{
  label: FormControl<string>;
  fullName: FormControl<string>;
  phone: FormControl<string>;
  streetAddress: FormControl<string>;
  apartmentOrBuilding: FormControl<string>;
  deliveryNotes: FormControl<string>;
  isDefault: FormControl<boolean>;
}>;

type AddressControlName = keyof AddressForm['controls'];

@Component({
  selector: 'app-customer-address-form',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, CustomerLocationFieldsComponent],
  templateUrl: './customer-address-form.component.html',
  styleUrl: './customer-address-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerAddressFormComponent {
  readonly address = input<CustomerAddress | null>(null);
  readonly saving = input(false);
  readonly save = output<CustomerAddressInput>();
  readonly dismissed = output<void>();

  readonly showActions = input(true);

  readonly submitted = signal(false);
  private readonly locationFields = viewChild(CustomerLocationFieldsComponent);
  readonly initialLocation = computed(() => {
    const address = this.address();
    return address ? { ...address, province: address.areaOrDistrict ?? '' } : null;
  });
  private appliedId: string | null | undefined;

  readonly form: AddressForm = new FormGroup({
    label: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(40)] }),
    fullName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(40)] }),
    streetAddress: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(240)] }),
    apartmentOrBuilding: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
    deliveryNotes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    isDefault: new FormControl(false, { nonNullable: true }),
  });

  private readonly translate = inject(TranslateService);

  constructor() {
    effect(() => {
      const address = this.address();
      if (this.appliedId === address?.id) return;
      this.appliedId = address?.id;
      this.submitted.set(false);
      this.form.reset({
        label: address?.label ?? '',
        fullName: address?.fullName ?? '',
        phone: address?.phone ?? '',
        streetAddress: address?.streetAddress ?? '',
        apartmentOrBuilding: address?.apartmentOrBuilding ?? '',
        deliveryNotes: address?.deliveryNotes ?? '',
        isDefault: address?.isDefault ?? false,
      });
    });
  }

  error(name: AddressControlName): string {
    const control = this.form.controls[name];
    if (!control.invalid || (!control.touched && !this.submitted())) return '';
    return this.translate.instant(
      control.hasError('maxlength')
        ? 'CUSTOMER.ACCOUNT.ADDRESSES.ERROR_MAX_LENGTH'
        : 'CUSTOMER.ACCOUNT.ADDRESSES.ERROR_REQUIRED',
    );
  }

  submit(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const location = this.locationFields()?.selection();
    if (!location || this.form.invalid || this.saving()) return;
    const value = this.form.getRawValue();
    this.save.emit({
      ...value,
      apartmentOrBuilding: value.apartmentOrBuilding.trim() || null,
      areaOrDistrict: location.province,
      country: location.country,
      city: location.city,
      countryId: location.countryId,
      provinceId: location.provinceId,
      cityId: location.cityId,
      deliveryNotes: value.deliveryNotes.trim() || null,
    });
  }
}
