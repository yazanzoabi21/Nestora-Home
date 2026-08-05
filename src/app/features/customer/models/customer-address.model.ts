export interface CustomerAddress {
  id: string;
  userId: string;
  label: string;
  fullName: string;
  phone: string;
  streetAddress: string;
  apartmentOrBuilding: string | null;
  city: string;
  areaOrDistrict: string | null;
  country: string;
  postalCode: string | null;
  deliveryNotes: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAddressInput {
  label: string;
  fullName: string;
  phone: string;
  streetAddress: string;
  apartmentOrBuilding: string | null;
  city: string;
  areaOrDistrict: string | null;
  country: string;
  postalCode: string | null;
  deliveryNotes: string | null;
  isDefault: boolean;
}

export interface CustomerAddressRow {
  id: string;
  user_id: string;
  label: string;
  full_name: string;
  phone: string;
  street_address: string;
  apartment_or_building: string | null;
  city: string;
  area_or_district: string | null;
  country: string;
  postal_code: string | null;
  delivery_notes: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}
