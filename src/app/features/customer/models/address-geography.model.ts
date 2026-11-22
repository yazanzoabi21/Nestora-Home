export interface GeographicOption {
  id: string;
  name_en: string;
  name_ar: string;
  iso_code?: string;
}

export interface AddressGeography {
  countryId?: string | null;
  provinceId?: string | null;
  cityId?: string | null;
}

export interface AddressLocation extends AddressGeography {
  country: string;
  province: string;
  city: string;
}

export interface SelectedAddressLocation extends AddressLocation {
  countryId: string;
  provinceId: string;
  cityId: string;
}
