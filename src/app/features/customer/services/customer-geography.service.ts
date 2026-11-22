import { Injectable, inject } from '@angular/core';

import { PUBLIC_SUPABASE } from '../../../core/tokens';
import { GeographicOption } from '../models/address-geography.model';

@Injectable({ providedIn: 'root' })
export class CustomerGeographyService {
  private readonly supabase = inject(PUBLIC_SUPABASE);
  private readonly catalog = new Map<string, { expiresAt: number; options: Promise<GeographicOption[]> }>();

  countries(): Promise<GeographicOption[]> {
    return this.cached('countries', () => this.load('countries'));
  }

  provinces(countryId: string): Promise<GeographicOption[]> {
    return this.cached('provinces:' + countryId, () => this.load('provinces', { column: 'country_id', id: countryId }));
  }

  cities(provinceId: string): Promise<GeographicOption[]> {
    return this.cached('cities:' + provinceId, () => this.load('cities', { column: 'province_id', id: provinceId }));
  }

  async isAvailable(countryId: string, provinceId: string, cityId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('cities')
      .select('id,provinces!inner(country_id)')
      .eq('id', cityId)
      .eq('province_id', provinceId)
      .eq('provinces.country_id', countryId)
      .maybeSingle();

    return !error && !!data;
  }

  private cached(key: string, load: () => Promise<GeographicOption[]>): Promise<GeographicOption[]> {
    const now = Date.now();
    const current = this.catalog.get(key);
    if (current && current.expiresAt > now) return current.options;

    for (const [cachedKey, entry] of this.catalog) {
      if (entry.expiresAt <= now) this.catalog.delete(cachedKey);
    }

    const options = load().catch((error: unknown) => {
      if (this.catalog.get(key)?.options === options) this.catalog.delete(key);
      throw error;
    });
    this.catalog.set(key, { expiresAt: now + 5 * 60 * 1000, options });
    return options;
  }

  private async load(
    table: 'countries' | 'provinces' | 'cities',
    parent?: { column: 'country_id' | 'province_id'; id: string },
  ): Promise<GeographicOption[]> {
    const results: GeographicOption[] = [];
    const pageSize = 250;

    while (true) {
      let query = this.supabase.from(table).select(
        table === 'countries' ? 'id,iso_code,name_en,name_ar' : 'id,name_en,name_ar',
      );
      if (parent) query = query.eq(parent.column, parent.id);

      const { data, error } = await query
        .order('sort_order')
        .order('name_en')
        .order('id')
        .range(results.length, results.length + pageSize - 1)
        .returns<GeographicOption[]>();

      if (error) throw error;
      results.push(...data);
      if (data.length < pageSize) return results;
    }
  }
}
