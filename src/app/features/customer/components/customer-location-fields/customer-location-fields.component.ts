import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  resource,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SearchableSelectComponent, SearchableSelectOption } from '../../../../shared/components/searchable-select/searchable-select.component';

import {
  AddressLocation,
  GeographicOption,
  SelectedAddressLocation,
} from '../../models/address-geography.model';
import { CustomerGeographyService } from '../../services/customer-geography.service';

type LocationField = 'country' | 'province' | 'city';

@Component({
  selector: 'app-customer-location-fields',
  imports: [TranslatePipe, SearchableSelectComponent],
  templateUrl: './customer-location-fields.component.html',
  styleUrl: './customer-location-fields.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerLocationFieldsComponent {
  readonly initial = input<AddressLocation | null>(null);
  readonly submitted = input(false);
  readonly idPrefix = input.required<string>();
  readonly changed = output<void>();

  private readonly geography = inject(CustomerGeographyService);
  private readonly translate = inject(TranslateService);
  private readonly draft = linkedSignal(() => this.initial());

  private readonly countryRequest = resource({ loader: () => this.geography.countries() });
  readonly countries = computed(() => this.countryRequest.hasValue() ? this.countryRequest.value() : []);
  readonly country = computed(() => {
    const draft = this.draft();
    if (!draft?.country && !draft?.countryId && this.countries().length === 1) {
      return this.countries()[0];
    }
    return this.match(this.countries(), draft?.countryId, draft?.country);
  });

  private readonly provinceRequest = resource({
    params: () => this.country()?.id,
    loader: ({ params }) => this.geography.provinces(params),
  });
  readonly provinces = computed(() => this.provinceRequest.hasValue() ? this.provinceRequest.value() : []);
  readonly province = computed(() => this.match(this.provinces(), this.draft()?.provinceId, this.draft()?.province));

  private readonly cityRequest = resource({
    params: () => this.province()?.id,
    loader: ({ params }) => this.geography.cities(params),
  });
  readonly cities = computed(() => this.cityRequest.hasValue() ? this.cityRequest.value() : []);
  readonly city = computed(() => this.match(this.cities(), this.draft()?.cityId, this.draft()?.city));

  readonly loading = computed(() =>
    this.countryRequest.isLoading() || this.provinceRequest.isLoading() || this.cityRequest.isLoading(),
  );
  readonly failed = computed(() =>
    [this.countryRequest, this.provinceRequest, this.cityRequest].some((request) => request.status() === 'error'),
  );
  readonly selection = computed<SelectedAddressLocation | null>(() => {
    const country = this.country();
    const province = this.province();
    const city = this.city();
    if (!country || !province || !city || this.loading() || this.failed()) return null;

    return {
      countryId: country.id, country: country.name_en,
      provinceId: province.id, province: province.name_en,
      cityId: city.id, city: city.name_en,
    };
  });

  readonly unmatchedLegacy = computed(() => {
    const draft = this.draft();
    return !this.loading() && !this.failed() && !!draft?.city && !this.selection();
  });

  readonly fields = computed(() => [
    {
      key: 'country', options: this.localize(this.countries()), loading: this.countryRequest.isLoading(),
      selected: this.country(), disabled: !this.countries().length ||
        (this.countries().length === 1 && !!this.country()),
    },
    {
      key: 'province', options: this.localize(this.provinces()), loading: this.provinceRequest.isLoading(),
      selected: this.province(), disabled: !this.country() || !this.provinces().length,
    },
    {
      key: 'city', options: this.localize(this.cities()), loading: this.cityRequest.isLoading(),
      selected: this.city(), disabled: !this.province() || !this.cities().length,
    },
  ] as const);

  readonly legacySummary = computed(() => {
    const draft = this.draft();
    return draft ? [draft.country, draft.province, draft.city].filter(Boolean).join(' · ') : '';
  });

  private localize(options: GeographicOption[]): SearchableSelectOption[] {
    const arabic = this.translate.currentLang()?.startsWith('ar');
    return options.map((option) => ({
      value: option.id,
      label: arabic ? option.name_ar : option.name_en,
      keywords: [arabic ? option.name_en : option.name_ar, option.iso_code ?? ''],
    }));
  }

  select(field: LocationField, id: string | null): void {
    const countryId = field === 'country' ? id : this.country()?.id;
    const provinceId = field === 'province' ? id : this.province()?.id;
    this.draft.set({
      countryId,
      provinceId: field === 'country' ? null : provinceId,
      cityId: field === 'city' ? id : null,
      country: '',
      province: '',
      city: '',
    });
    this.changed.emit();
  }

  showError(field: LocationField): boolean {
    return this.submitted() && !this.loading() && !this.failed() && !this[field]();
  }

  retry(): void {
    for (const request of [this.countryRequest, this.provinceRequest, this.cityRequest]) {
      if (request.status() === 'error') request.reload();
    }
  }

  private match(
    options: readonly GeographicOption[],
    id?: string | null,
    originalName?: string,
  ): GeographicOption | undefined {
    if (id) return options.find((option) => option.id === id);
    const name = originalName?.trim().toLowerCase();
    if (!name) return undefined;
    const matches = options.filter((option) =>
      [option.name_en, option.name_ar, option.iso_code].some((label) => label?.toLowerCase() === name),
    );
    return matches.length === 1 ? matches[0] : undefined;
  }
}
