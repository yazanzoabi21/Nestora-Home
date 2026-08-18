import { Injectable, inject } from '@angular/core';

import { SupportedLanguage } from '../../../core/services/translation/translation.service';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import {
  CustomerSearchResult,
  CustomerSearchResultRow,
  CustomerSearchResultType,
} from '../models';

const SEARCH_CACHE_TTL_MS = 30_000;
const SEARCH_CACHE_MAX_ENTRIES = 20;
const SEARCH_LIMIT = 15;

interface CachedSearchResults {
  readonly expiresAt: number;
  readonly results: readonly CustomerSearchResult[];
}

@Injectable({ providedIn: 'root' })
export class CustomerSearchService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly cache = new Map<string, CachedSearchResults>();

  async search(query: string, language: SupportedLanguage): Promise<readonly CustomerSearchResult[]> {
    const normalizedQuery = this.normalizeQuery(query);
    if (normalizedQuery.length < 2) return [];

    const cacheKey = `${language}:${normalizedQuery.toLocaleLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.results;
    if (cached) this.cache.delete(cacheKey);

    const { data, error } = await this.supabase.rpc('search_customer_site', {
      p_query: normalizedQuery,
      p_language: language,
      p_limit: SEARCH_LIMIT,
    });

    if (error) throw new Error(error.message);
    const results = ((data ?? []) as CustomerSearchResultRow[])
      .map((row) => this.mapResult(row))
      .filter((result): result is CustomerSearchResult => result !== null);

    this.remember(cacheKey, results);
    return results;
  }

  normalizeQuery(query: string): string {
    return query.trim().replace(/\s+/g, ' ');
  }

  private mapResult(row: CustomerSearchResultRow): CustomerSearchResult | null {
    if (!this.isResultType(row.result_type) || !row.id || !row.title || !row.route) return null;
    const metadata = this.isRecord(row.metadata) ? row.metadata : {};
    const regularPrice = this.numberValue(metadata['price']);
    const salePrice = this.numberValue(metadata['sale_price']);
    const hasSale = regularPrice !== null && salePrice !== null && salePrice < regularPrice;

    return {
      id: row.id,
      type: row.result_type,
      title: row.title,
      description: row.description,
      imageUrl: row.image_url,
      route: row.route,
      score: Number(row.score) || 0,
      price: hasSale ? salePrice : regularPrice,
      originalPrice: hasSale ? regularPrice : null,
      category: this.stringValue(metadata['category']),
      sku: this.stringValue(metadata['sku']),
    };
  }

  private remember(cacheKey: string, results: readonly CustomerSearchResult[]): void {
    if (this.cache.size >= SEARCH_CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (typeof oldestKey === 'string') this.cache.delete(oldestKey);
    }
    this.cache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, results });
  }

  private isResultType(value: string): value is CustomerSearchResultType {
    return value === 'product' || value === 'category' || value === 'faq' || value === 'page';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private numberValue(value: unknown): number | null {
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(number) ? number : null;
  }

  private stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
  }
}
