import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { CustomerAddress, CustomerAddressInput } from '../../models';

type AddressForm = FormGroup<{
  label: FormControl<string>;
  fullName: FormControl<string>;
  phone: FormControl<string>;
  streetAddress: FormControl<string>;
  apartmentOrBuilding: FormControl<string>;
  city: FormControl<string>;
  areaOrDistrict: FormControl<string>;
  country: FormControl<string>;
  postalCode: FormControl<string>;
  deliveryNotes: FormControl<string>;
  isDefault: FormControl<boolean>;
}>;

type AddressControlName = keyof AddressForm['controls'];

@Component({
  selector: 'app-customer-address-form',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
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

  private submitted = false;
  private appliedId: string | null | undefined;

  readonly form: AddressForm = new FormGroup({
    label: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(40)] }),
    fullName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(40)] }),
    streetAddress: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(240)] }),
    apartmentOrBuilding: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
    city: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    areaOrDistrict: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
    country: new FormControl('Lebanon', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    postalCode: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(40)] }),
    deliveryNotes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    isDefault: new FormControl(false, { nonNullable: true }),
  });

  private readonly translate = inject(TranslateService);

  constructor() {
    effect(() => {
      const address = this.address();
      if (this.appliedId === address?.id) return;
      this.appliedId = address?.id;
      this.submitted = false;
      this.form.reset({
        label: address?.label ?? '',
        fullName: address?.fullName ?? '',
        phone: address?.phone ?? '',
        streetAddress: address?.streetAddress ?? '',
        apartmentOrBuilding: address?.apartmentOrBuilding ?? '',
        city: address?.city ?? '',
        areaOrDistrict: address?.areaOrDistrict ?? '',
        country: address?.country ?? 'Lebanon',
        postalCode: address?.postalCode ?? '',
        deliveryNotes: address?.deliveryNotes ?? '',
        isDefault: address?.isDefault ?? false,
      });
    });
  }

  error(name: AddressControlName): string {
    const control = this.form.controls[name];
    if (!control.invalid || (!control.touched && !this.submitted)) return '';
    return this.translate.instant(
      control.hasError('maxlength')
        ? 'CUSTOMER.ACCOUNT.ADDRESSES.ERROR_MAX_LENGTH'
        : 'CUSTOMER.ACCOUNT.ADDRESSES.ERROR_REQUIRED',
    );
  }

  submit(): void {
    this.submitted = true;
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const value = this.form.getRawValue();
    this.save.emit({
      ...value,
      apartmentOrBuilding: value.apartmentOrBuilding.trim() || null,
      areaOrDistrict: value.areaOrDistrict.trim() || null,
      postalCode: value.postalCode.trim() || null,
      deliveryNotes: value.deliveryNotes.trim() || null,
    });
  }
}
