import { Injectable, inject, signal } from '@angular/core';

import { CustomerAuthService } from '../../../core/services/auth';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import {
  CustomerAddress,
  CustomerAddressInput,
  CustomerAddressRow,
} from '../models/customer-address.model';

@Injectable({ providedIn: 'root' })
export class CustomerAddressesService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly auth = inject(CustomerAuthService);

  private addressRevision = 0;
  private readonly _addresses = signal<readonly CustomerAddress[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly addresses = this._addresses.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  async load(): Promise<readonly CustomerAddress[]> {
    const userId = await this.requireUserId();
    const revision = ++this.addressRevision;
    this._loading.set(true);
    this._error.set(null);

    try {
      const addresses = await this.readAddresses(userId);
      if (revision === this.addressRevision) this._addresses.set(addresses);
      return addresses;
    } catch (error) {
      if (revision === this.addressRevision) {
        this._error.set(this.message(error, 'Unable to load saved addresses.'));
      }
      throw error;
    } finally {
      this._loading.set(false);
    }
  }

  async create(input: CustomerAddressInput): Promise<CustomerAddress> {
    const userId = await this.requireUserId();
    const { data, error } = await this.supabase
      .from('customer_addresses')
      .insert(this.toPayload(userId, input))
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    await this.load();
    return this.mapRow(data as CustomerAddressRow);
  }

  async update(id: string, input: CustomerAddressInput): Promise<CustomerAddress> {
    const userId = await this.requireUserId();
    const { data, error } = await this.supabase
      .from('customer_addresses')
      .update(this.toPayload(userId, input))
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    await this.load();
    return this.mapRow(data as CustomerAddressRow);
  }

  async remove(id: string): Promise<void> {
    const userId = await this.requireUserId();
    const { data, error } = await this.supabase
      .from('customer_addresses')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('The saved address could not be deleted.');

    this._addresses.update((addresses) => addresses.filter((address) => address.id !== id));
    void this.refreshAfterRemoval(userId);
  }

  private async refreshAfterRemoval(userId: string): Promise<void> {
    const revision = ++this.addressRevision;
    try {
      const addresses = await this.readAddresses(userId);
      if (revision === this.addressRevision) this._addresses.set(addresses);
    } catch {
      // The delete already succeeded. Keep the local list until the next successful load.
    }
  }

  private async readAddresses(userId: string): Promise<CustomerAddress[]> {
    const { data, error } = await this.supabase
      .from('customer_addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data as CustomerAddressRow[]).map((row) => this.mapRow(row));
  }

  async setDefault(id: string): Promise<void> {
    const userId = await this.requireUserId();
    const { error } = await this.supabase
      .from('customer_addresses')
      .update({ is_default: true })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    await this.load();
  }

  private async requireUserId(): Promise<string> {
    const userId = await this.auth.getCurrentUserId();
    if (!userId) throw new Error('You must be signed in to manage saved addresses.');
    return userId;
  }

  private toPayload(userId: string, input: CustomerAddressInput) {
    return {
      user_id: userId,
      label: input.label.trim(),
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      street_address: input.streetAddress.trim(),
      apartment_or_building: input.apartmentOrBuilding?.trim() || null,
      country_id: input.countryId ?? null,
      province_id: input.provinceId ?? null,
      city_id: input.cityId ?? null,
      city: input.city.trim(),
      area_or_district: input.areaOrDistrict?.trim() || null,
      country: input.country.trim(),
      delivery_notes: input.deliveryNotes?.trim() || null,
      is_default: input.isDefault,
    };
  }

  private mapRow(row: CustomerAddressRow): CustomerAddress {
    return {
      id: row.id,
      userId: row.user_id,
      label: row.label,
      fullName: row.full_name,
      phone: row.phone,
      streetAddress: row.street_address,
      apartmentOrBuilding: row.apartment_or_building,
      countryId: row.country_id ?? null,
      provinceId: row.province_id ?? null,
      cityId: row.city_id ?? null,
      city: row.city,
      areaOrDistrict: row.area_or_district,
      country: row.country,
      deliveryNotes: row.delivery_notes,
      isDefault: row.is_default,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
