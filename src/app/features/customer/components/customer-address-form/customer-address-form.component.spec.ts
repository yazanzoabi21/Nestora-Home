import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';

import { CustomerAddress, CustomerAddressInput } from '../../models';
import { CustomerGeographyService } from '../../services/customer-geography.service';
import { CustomerAddressFormComponent } from './customer-address-form.component';

describe('saved address geography', () => {
  const lebanon = { id: 'lb', iso_code: 'LB', name_en: 'Lebanon', name_ar: 'لبنان' };
  const otherCountry = { id: 'other', iso_code: 'ZZ', name_en: 'Other country', name_ar: 'دولة أخرى' };
  const beirut = { id: 'beirut-province', name_en: 'Beirut', name_ar: 'بيروت' };
  const otherProvince = { id: 'other-province', name_en: 'Other province', name_ar: 'محافظة أخرى' };
  const city = { id: 'beirut', name_en: 'Beirut', name_ar: 'بيروت' };

  const saved: CustomerAddress = {
    id: 'legacy', userId: 'customer', label: 'Home', fullName: 'Test Customer', phone: '70123456',
    streetAddress: 'Original street', apartmentOrBuilding: 'Apt 3', city: 'بيروت',
    areaOrDistrict: 'Beirut', country: 'LB', deliveryNotes: null, isDefault: true,
    createdAt: '', updatedAt: '',
  };

  function render(address: CustomerAddress) {
    TestBed.configureTestingModule({
      imports: [CustomerAddressFormComponent],
      providers: [
        provideTranslateService({ lang: 'en' }),
        { provide: CustomerGeographyService, useValue: {
          countries: async () => [lebanon, otherCountry],
          provinces: async (id: string) => id === 'lb' ? [beirut] : [otherProvince],
          cities: async (id: string) => id === beirut.id ? [city] : [],
        } },
      ],
    });
    const fixture = TestBed.createComponent(CustomerAddressFormComponent);
    fixture.componentRef.setInput('address', address);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const select = (field: string): HTMLButtonElement =>
      root.querySelector<HTMLButtonElement>('#account-location-' + field)!;
    const options = (field: string): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>('#account-location-' + field + '-listbox [role="option"]'));
    const change = (field: string, label: string): void => {
      select(field).click();
      fixture.detectChanges();
      const option = options(field).find((row) => row.textContent?.trim() === label);
      expect(option).toBeDefined();
      option!.click();
      fixture.detectChanges();
    };
    const savedEvent = vi.fn<(input: CustomerAddressInput) => void>();
    fixture.componentInstance.save.subscribe(savedEvent);
    return { fixture, select, options, change, savedEvent };
  }

  it('matches legacy bilingual labels and emits the location IDs with textual address fields', async () => {
    const { fixture, select, savedEvent } = render(saved);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(select('city').textContent?.trim()).toBe('Beirut');
    });
    fixture.componentInstance.submit();
    expect(savedEvent).toHaveBeenCalledWith(expect.objectContaining({
      countryId: 'lb', provinceId: 'beirut-province', cityId: 'beirut',
      country: 'Lebanon', areaOrDistrict: 'Beirut', city: 'Beirut', streetAddress: 'Original street',
    }));
  });

  it('displays Arabic option names while still searching by their English names', async () => {
    const { fixture, select, options } = render(saved);
    TestBed.inject(TranslateService).use('ar');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(select('city').textContent?.trim()).toBe('بيروت');
    });
    select('city').click();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const search = root.querySelector<HTMLInputElement>('input[aria-controls="account-location-city-listbox"]')!;
    search.value = 'BeIrUt';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(options('city').map((row) => row.textContent?.trim())).toEqual(['بيروت']);
  });

  it('clears dependent selections on country change and keeps the original street', async () => {
    const { fixture, select, options, change, savedEvent } = render(saved);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(select('city').textContent?.trim()).toBe('Beirut');
    });
    change('country', 'Other country');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(select('province').disabled).toBe(false);
    });
    expect(select('province').textContent?.trim()).toBe('CUSTOMER.LOCATION.choose_province');
    select('province').click();
    fixture.detectChanges();
    expect(options('province').map((row) => row.textContent?.trim())).toEqual(['Other province']);
    expect(select('city').textContent?.trim()).toBe('CUSTOMER.LOCATION.choose_city');
    expect(fixture.componentInstance.form.controls.streetAddress.value).toBe('Original street');
    fixture.componentInstance.submit();
    expect(savedEvent).not.toHaveBeenCalled();
  });

  it('keeps an unmatched legacy address intact until a city is confirmed', async () => {
    const { fixture, select, change, savedEvent } = render({ ...saved, city: 'Previous locality spelling' });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(select('city').disabled).toBe(false);
    });
    expect(select('city').textContent?.trim()).toBe('CUSTOMER.LOCATION.choose_city');
    fixture.componentInstance.submit();
    expect(savedEvent).not.toHaveBeenCalled();
    change('city', city.name_en);
    fixture.componentInstance.submit();
    expect(savedEvent).toHaveBeenCalledWith(expect.objectContaining({
      cityId: city.id, streetAddress: 'Original street', apartmentOrBuilding: 'Apt 3',
    }));
  });
});
