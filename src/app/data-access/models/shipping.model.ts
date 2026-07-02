export interface ShippingMethod {
  id: string;
  name: string;
  code: string | null;
  carrier_name: string | null;
  description: string | null;
  icon: string | null;
  base_cost: number;
  free_shipping_min_amount: number | null;
  eta_min_days: number | null;
  eta_max_days: number | null;
  eta_label: string | null;
  is_active: boolean;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DeliveryZone {
  id: string;
  name: string;
  country: string | null;
  cities: string[];
  areas: string[];
  extra_cost: number;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface ShippingMethodZone {
  id: string;
  shipping_method_id: string;
  delivery_zone_id: string;
  cost_override: number | null;
  free_shipping_min_amount_override: number | null;
  eta_min_days_override: number | null;
  eta_max_days_override: number | null;
  eta_label_override: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  shipping_method?: ShippingMethod | null;
  delivery_zone?: DeliveryZone | null;
}

export interface ShippingStats {
  activeMethods: number;
  averageShippingCost: number;
  activeZones: number;
  disabledMethods: number;
}

export interface ShippingMethodPayload {
  name: string;
  code: string | null;
  carrier_name: string | null;
  description: string | null;
  icon: string | null;
  base_cost: number;
  free_shipping_min_amount: number | null;
  eta_min_days: number | null;
  eta_max_days: number | null;
  eta_label: string | null;
  is_active: boolean;
  sort_order: number | null;
}

export interface DeliveryZonePayload {
  name: string;
  country: string | null;
  cities: string[];
  areas: string[];
  extra_cost: number;
  is_active: boolean;
}

export interface ShippingMethodZonePayload {
  shipping_method_id: string;
  delivery_zone_id: string;
  cost_override: number | null;
  free_shipping_min_amount_override: number | null;
  eta_min_days_override: number | null;
  eta_max_days_override: number | null;
  eta_label_override: string | null;
  is_active: boolean;
}
