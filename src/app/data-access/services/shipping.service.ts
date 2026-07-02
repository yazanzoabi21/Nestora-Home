import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../core/services/supabase';
import {
  DeliveryZone,
  DeliveryZonePayload,
  ShippingMethod,
  ShippingMethodPayload,
  ShippingMethodZone,
  ShippingMethodZonePayload,
  ShippingStats,
} from '../models';

const SHIPPING_METHOD_SELECT = `
  id,
  name,
  code,
  carrier_name,
  description,
  icon,
  base_cost,
  free_shipping_min_amount,
  eta_min_days,
  eta_max_days,
  eta_label,
  is_active,
  sort_order,
  created_at,
  updated_at
`;

const DELIVERY_ZONE_SELECT = `
  id,
  name,
  country,
  cities,
  areas,
  extra_cost,
  is_active,
  created_at,
  updated_at
`;

const SHIPPING_METHOD_ZONE_SELECT = `
  id,
  shipping_method_id,
  delivery_zone_id,
  cost_override,
  free_shipping_min_amount_override,
  eta_min_days_override,
  eta_max_days_override,
  eta_label_override,
  is_active,
  created_at,
  updated_at,
  shipping_method:shipping_method_id (
    ${SHIPPING_METHOD_SELECT}
  ),
  delivery_zone:delivery_zone_id (
    ${DELIVERY_ZONE_SELECT}
  )
`;

type Relation<T> = T | T[] | null;

interface ShippingMethodRecord extends Omit<ShippingMethod, 'base_cost' | 'free_shipping_min_amount' | 'eta_min_days' | 'eta_max_days' | 'is_active' | 'sort_order'> {
  base_cost: number | string | null;
  free_shipping_min_amount: number | string | null;
  eta_min_days: number | string | null;
  eta_max_days: number | string | null;
  is_active: boolean | null;
  sort_order: number | string | null;
}

interface DeliveryZoneRecord extends Omit<DeliveryZone, 'cities' | 'areas' | 'extra_cost' | 'is_active'> {
  cities: string[] | string | null;
  areas: string[] | string | null;
  extra_cost: number | string | null;
  is_active: boolean | null;
}

interface ShippingMethodZoneRecord extends Omit<ShippingMethodZone, 'cost_override' | 'free_shipping_min_amount_override' | 'eta_min_days_override' | 'eta_max_days_override' | 'is_active' | 'shipping_method' | 'delivery_zone'> {
  cost_override: number | string | null;
  free_shipping_min_amount_override: number | string | null;
  eta_min_days_override: number | string | null;
  eta_max_days_override: number | string | null;
  is_active: boolean | null;
  shipping_method?: Relation<ShippingMethodRecord>;
  delivery_zone?: Relation<DeliveryZoneRecord>;
}

@Injectable({
  providedIn: 'root',
})
export class ShippingService {
  private readonly supabase = inject(SupabaseService).client;

  async getShippingMethods(): Promise<ShippingMethod[]> {
    const { data, error } = await this.supabase
      .from('shipping_methods')
      .select(SHIPPING_METHOD_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Unable to load shipping methods. ${error.message}`);
    }

    return (data ?? []).map((method) => this.mapShippingMethod(method as ShippingMethodRecord));
  }

  async createShippingMethod(payload: ShippingMethodPayload): Promise<ShippingMethod> {
    const { data, error } = await this.supabase
      .from('shipping_methods')
      .insert(this.toShippingMethodRecord(payload))
      .select(SHIPPING_METHOD_SELECT)
      .single();

    if (error) {
      throw new Error(`Unable to create shipping method. ${error.message}`);
    }

    return this.mapShippingMethod(data as ShippingMethodRecord);
  }

  async updateShippingMethod(id: string, payload: Partial<ShippingMethodPayload>): Promise<ShippingMethod> {
    const { data, error } = await this.supabase
      .from('shipping_methods')
      .update(this.toShippingMethodRecord(payload))
      .eq('id', id)
      .select(SHIPPING_METHOD_SELECT)
      .single();

    if (error) {
      throw new Error(`Unable to update shipping method. ${error.message}`);
    }

    return this.mapShippingMethod(data as ShippingMethodRecord);
  }

  async deleteShippingMethod(id: string): Promise<void> {
    const { error } = await this.supabase.from('shipping_methods').delete().eq('id', id);

    if (error) {
      throw new Error(`Unable to delete shipping method. ${error.message}`);
    }
  }

  async toggleShippingMethod(method: ShippingMethod): Promise<ShippingMethod> {
    return this.updateShippingMethod(method.id, { is_active: !method.is_active });
  }

  async getDeliveryZones(): Promise<DeliveryZone[]> {
    const { data, error } = await this.supabase
      .from('delivery_zones')
      .select(DELIVERY_ZONE_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Unable to load delivery zones. ${error.message}`);
    }

    return (data ?? []).map((zone) => this.mapDeliveryZone(zone as DeliveryZoneRecord));
  }

  async createDeliveryZone(payload: DeliveryZonePayload): Promise<DeliveryZone> {
    const { data, error } = await this.supabase
      .from('delivery_zones')
      .insert(this.toDeliveryZoneRecord(payload))
      .select(DELIVERY_ZONE_SELECT)
      .single();

    if (error) {
      throw new Error(`Unable to create delivery zone. ${error.message}`);
    }

    return this.mapDeliveryZone(data as DeliveryZoneRecord);
  }

  async updateDeliveryZone(id: string, payload: DeliveryZonePayload): Promise<DeliveryZone> {
    const { data, error } = await this.supabase
      .from('delivery_zones')
      .update(this.toDeliveryZoneRecord(payload))
      .eq('id', id)
      .select(DELIVERY_ZONE_SELECT)
      .single();

    if (error) {
      throw new Error(`Unable to update delivery zone. ${error.message}`);
    }

    return this.mapDeliveryZone(data as DeliveryZoneRecord);
  }

  async deleteDeliveryZone(id: string): Promise<void> {
    const { error } = await this.supabase.from('delivery_zones').delete().eq('id', id);

    if (error) {
      throw new Error(`Unable to delete delivery zone. ${error.message}`);
    }
  }

  async toggleDeliveryZone(zone: DeliveryZone): Promise<void> {
    const { error } = await this.supabase
      .from('delivery_zones')
      .update({ is_active: !zone.is_active })
      .eq('id', zone.id);

    if (error) {
      throw new Error(`Unable to update delivery zone status. ${error.message}`);
    }
  }

  async getShippingMethodZones(): Promise<ShippingMethodZone[]> {
    const { data, error } = await this.supabase
      .from('shipping_method_zones')
      .select(SHIPPING_METHOD_ZONE_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Unable to load shipping method zones. ${error.message}`);
    }

    return (data ?? []).map((item) => this.mapShippingMethodZone(item as ShippingMethodZoneRecord));
  }

  async createShippingMethodZone(payload: ShippingMethodZonePayload): Promise<ShippingMethodZone> {
    const { data, error } = await this.supabase
      .from('shipping_method_zones')
      .insert(payload)
      .select(SHIPPING_METHOD_ZONE_SELECT)
      .single();

    if (error) {
      throw new Error(`Unable to create shipping method zone. ${error.message}`);
    }

    return this.mapShippingMethodZone(data as ShippingMethodZoneRecord);
  }

  async updateShippingMethodZone(id: string, payload: ShippingMethodZonePayload): Promise<ShippingMethodZone> {
    const { data, error } = await this.supabase
      .from('shipping_method_zones')
      .update(payload)
      .eq('id', id)
      .select(SHIPPING_METHOD_ZONE_SELECT)
      .single();

    if (error) {
      throw new Error(`Unable to update shipping method zone. ${error.message}`);
    }

    return this.mapShippingMethodZone(data as ShippingMethodZoneRecord);
  }

  async deleteShippingMethodZone(id: string): Promise<void> {
    const { error } = await this.supabase.from('shipping_method_zones').delete().eq('id', id);

    if (error) {
      throw new Error(`Unable to delete shipping method zone. ${error.message}`);
    }
  }

  async toggleShippingMethodZone(item: ShippingMethodZone): Promise<void> {
    const { error } = await this.supabase
      .from('shipping_method_zones')
      .update({ is_active: !item.is_active })
      .eq('id', item.id);

    if (error) {
      throw new Error(`Unable to update method zone status. ${error.message}`);
    }
  }

  getShippingStats(methods: ShippingMethod[], zones: DeliveryZone[]): ShippingStats {
    const activeMethods = methods.filter((method) => method.is_active);
    const disabledMethods = methods.filter((method) => !method.is_active);
    const averageShippingCost = methods.length
      ? methods.reduce((sum, method) => sum + method.base_cost, 0) / methods.length
      : 0;

    return {
      activeMethods: activeMethods.length,
      averageShippingCost,
      activeZones: zones.filter((zone) => zone.is_active).length,
      disabledMethods: disabledMethods.length,
    };
  }

  private toShippingMethodRecord(payload: Partial<ShippingMethodPayload>): Partial<ShippingMethodPayload> {
    const record: Partial<ShippingMethodPayload> = {};

    if ('name' in payload) {
      record.name = payload.name?.trim() ?? '';
    }

    if ('code' in payload) {
      record.code = payload.code?.trim() || null;
    }

    if ('carrier_name' in payload) {
      record.carrier_name = payload.carrier_name?.trim() || null;
    }

    if ('description' in payload) {
      record.description = payload.description?.trim() || null;
    }

    if ('icon' in payload) {
      record.icon = payload.icon?.trim() || null;
    }

    if ('base_cost' in payload) {
      record.base_cost = Number(payload.base_cost ?? 0);
    }

    if ('free_shipping_min_amount' in payload) {
      record.free_shipping_min_amount =
        payload.free_shipping_min_amount === null || payload.free_shipping_min_amount === undefined
          ? null
          : Number(payload.free_shipping_min_amount);
    }

    if ('eta_min_days' in payload) {
      record.eta_min_days =
        payload.eta_min_days === null || payload.eta_min_days === undefined
          ? null
          : Number(payload.eta_min_days);
    }

    if ('eta_max_days' in payload) {
      record.eta_max_days =
        payload.eta_max_days === null || payload.eta_max_days === undefined
          ? null
          : Number(payload.eta_max_days);
    }

    if ('eta_label' in payload) {
      record.eta_label = payload.eta_label?.trim() || null;
    }

    if ('is_active' in payload) {
      record.is_active = payload.is_active;
    }

    if ('sort_order' in payload) {
      record.sort_order =
        payload.sort_order === null || payload.sort_order === undefined
          ? null
          : Number(payload.sort_order);
    }

    return record;
  }

  private toDeliveryZoneRecord(payload: DeliveryZonePayload): DeliveryZonePayload {
    return {
      name: payload.name.trim(),
      country: payload.country?.trim() || null,
      cities: payload.cities,
      areas: payload.areas,
      extra_cost: Number(payload.extra_cost ?? 0),
      is_active: payload.is_active,
    };
  }

  private mapShippingMethod(method: ShippingMethodRecord): ShippingMethod {
    return {
      ...method,
      name: method.name ?? 'Shipping method',
      code: method.code ?? null,
      carrier_name: method.carrier_name ?? null,
      description: method.description ?? null,
      icon: method.icon ?? null,
      base_cost: this.numberValue(method.base_cost),
      free_shipping_min_amount:
        method.free_shipping_min_amount === null || method.free_shipping_min_amount === undefined
          ? null
          : this.numberValue(method.free_shipping_min_amount),
      eta_min_days:
        method.eta_min_days === null || method.eta_min_days === undefined
          ? null
          : this.numberValue(method.eta_min_days),
      eta_max_days:
        method.eta_max_days === null || method.eta_max_days === undefined
          ? null
          : this.numberValue(method.eta_max_days),
      eta_label: method.eta_label ?? null,
      is_active: method.is_active ?? false,
      sort_order:
        method.sort_order === null || method.sort_order === undefined
          ? null
          : this.numberValue(method.sort_order),
      created_at: method.created_at ?? null,
      updated_at: method.updated_at ?? null,
    };
  }

  private mapDeliveryZone(zone: DeliveryZoneRecord): DeliveryZone {
    return {
      ...zone,
      name: zone.name ?? 'Delivery zone',
      country: zone.country ?? null,
      cities: this.stringList(zone.cities),
      areas: this.stringList(zone.areas),
      extra_cost: this.numberValue(zone.extra_cost),
      is_active: zone.is_active ?? false,
      created_at: zone.created_at ?? null,
      updated_at: zone.updated_at ?? null,
    };
  }

  private mapShippingMethodZone(item: ShippingMethodZoneRecord): ShippingMethodZone {
    return {
      id: item.id,
      shipping_method_id: item.shipping_method_id,
      delivery_zone_id: item.delivery_zone_id,
      cost_override: item.cost_override === null || item.cost_override === undefined ? null : this.numberValue(item.cost_override),
      free_shipping_min_amount_override:
        item.free_shipping_min_amount_override === null || item.free_shipping_min_amount_override === undefined
          ? null
          : this.numberValue(item.free_shipping_min_amount_override),
      eta_min_days_override:
        item.eta_min_days_override === null || item.eta_min_days_override === undefined
          ? null
          : this.numberValue(item.eta_min_days_override),
      eta_max_days_override:
        item.eta_max_days_override === null || item.eta_max_days_override === undefined
          ? null
          : this.numberValue(item.eta_max_days_override),
      eta_label_override: item.eta_label_override ?? null,
      is_active: item.is_active ?? false,
      created_at: item.created_at ?? null,
      updated_at: item.updated_at ?? null,
      shipping_method: this.firstRelation(item.shipping_method, (method) => this.mapShippingMethod(method)),
      delivery_zone: this.firstRelation(item.delivery_zone, (zone) => this.mapDeliveryZone(zone)),
    };
  }

  private firstRelation<TRecord, TModel>(
    relation: Relation<TRecord> | undefined,
    mapper: (record: TRecord) => TModel
  ): TModel | null {
    const value = Array.isArray(relation) ? relation[0] : relation;
    return value ? mapper(value) : null;
  }

  private stringList(value: string[] | string | null): string[] {
    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  }

  private numberValue(value: number | string | null | undefined): number {
    return Number(value ?? 0);
  }
}
