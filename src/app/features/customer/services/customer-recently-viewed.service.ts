import { Injectable, effect, inject, signal } from '@angular/core';
import { CustomerAuthService } from '../../../core/services/auth';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { CustomerProduct } from '../models';
import { CustomerCatalogService } from './customer-catalog.service';

interface ProductHistoryRow {
  product_id: string;
  viewed_at: string;
}

export interface CustomerRecentlyViewedSnapshot {
  readonly userId: string | null;
  readonly productIds: readonly string[];
  readonly products: readonly CustomerProduct[];
}

const GUEST_HISTORY_KEY = 'nestora_recently_viewed_products_v1';
const MAX_GUEST_PRODUCTS = 12;
const MAX_HOMEPAGE_PRODUCTS = 10;

@Injectable({ providedIn: 'root' })
export class CustomerRecentlyViewedService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly auth = inject(CustomerAuthService);
  private readonly productsService = inject(CustomerCatalogService);
  private readonly revisionSignal = signal(0);

  readonly revision = this.revisionSignal.asReadonly();

  private mergeRequest: Promise<void> | null = null;

  constructor() {
    effect(() => {
      const authLoading = this.auth.isLoading();
      const userId = this.auth.session()?.user.id ?? null;

      if (!authLoading && userId) {
        void this.mergeGuestHistory().catch((error: unknown) => {
          console.warn('Unable to merge guest recently viewed history.', error);
        });
      }
    });
  }

  async recordView(productId: string): Promise<void> {
    const normalizedProductId = productId.trim();
    if (!normalizedProductId) return;

    try {
      const userId = await this.getCurrentCustomerUserId();

      if (userId) {
        console.log('CUSTOMER SESSION USER ID:', userId, '(record_product_view)');
        try {
          await this.mergeGuestHistory();
        } catch (error) {
          console.warn('Unable to merge guest history before recording a product view.', error);
        }
        await this.recordAuthenticatedView(normalizedProductId);
      } else {
        this.writeGuestIds([
          normalizedProductId,
          ...this.readGuestIds().filter((id) => id !== normalizedProductId),
        ]);
      }

      this.revisionSignal.update((revision) => revision + 1);
    } catch (error) {
      this.logSupabaseFailure(
        'Unable to record a recently viewed product.',
        error,
        { productId: normalizedProductId },
      );
    }
  }

  async getRecentlyViewed(limit = MAX_HOMEPAGE_PRODUCTS): Promise<readonly CustomerProduct[]> {
    return (await this.getRecentlyViewedSnapshot(limit)).products;
  }

  async getRecentlyViewedSnapshot(
    limit = MAX_HOMEPAGE_PRODUCTS,
  ): Promise<CustomerRecentlyViewedSnapshot> {
    const normalizedLimit = this.normalizeLimit(limit);
    const userId = await this.getCurrentCustomerUserId();

    if (!userId) {
      const productIds = this.readGuestIds();
      const products = await this.loadProductsInOrder(productIds, normalizedLimit);
      return {
        userId: null,
        productIds: products.map((product) => product.id),
        products,
      };
    }

    console.log('CUSTOMER SESSION USER ID:', userId, '(customer_product_history SELECT)');

    try {
      await this.mergeGuestHistory();
    } catch (error) {
      console.warn('Unable to merge guest history before loading recently viewed products.', error);
    }

    const { data, error } = await this.supabase
      .from('customer_product_history')
      .select('product_id, viewed_at')
      .eq('user_id', userId)
      .order('viewed_at', { ascending: false })
      .limit(MAX_HOMEPAGE_PRODUCTS);

    if (error) {
      this.logSupabaseFailure(
        'Unable to query authenticated recently viewed history.',
        error,
        { userId },
      );
      throw error;
    }

    const productIds = this.uniqueProductIds((data ?? []) as ProductHistoryRow[]);
    const products = await this.loadProductsInOrder(productIds, normalizedLimit);

    return {
      userId,
      productIds: products.map((product) => product.id),
      products,
    };
  }

  async clearHistory(): Promise<void> {
    const userId = await this.getCurrentCustomerUserId();

    if (userId) {
      const { error } = await this.supabase
        .from('customer_product_history')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;
    } else {
      this.removeGuestHistory();
    }

    this.revisionSignal.update((revision) => revision + 1);
  }

  mergeGuestHistory(): Promise<void> {
    this.mergeRequest ??= this.performGuestMerge().finally(() => {
      this.mergeRequest = null;
    });
    return this.mergeRequest;
  }

  private async performGuestMerge(): Promise<void> {
    const userId = await this.getCurrentCustomerUserId();
    if (!userId) return;

    const guestProductIds = this.readGuestIds();
    if (guestProductIds.length === 0) return;

    for (const productId of [...guestProductIds].reverse()) {
      await this.recordAuthenticatedView(productId);
    }

    this.removeGuestHistory();
  }

  private async recordAuthenticatedView(productId: string): Promise<void> {
    const { error } = await this.supabase.rpc('record_product_view', {
      target_product_id: productId,
    });

    if (error) {
      this.logSupabaseFailure(
        'Unable to record an authenticated product view.',
        error,
        { productId },
      );
      throw error;
    }
  }

  private async loadProductsInOrder(
    productIds: readonly string[],
    limit: number,
  ): Promise<readonly CustomerProduct[]> {
    const products = await this.productsService.getProductsByIds(
      productIds.slice(0, MAX_GUEST_PRODUCTS),
    );
    return products.slice(0, limit);
  }

  private uniqueProductIds(rows: readonly ProductHistoryRow[]): string[] {
    const productIds: string[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      if (typeof row.product_id !== 'string' || seen.has(row.product_id)) continue;
      seen.add(row.product_id);
      productIds.push(row.product_id);
    }

    return productIds;
  }

  private async getCurrentCustomerUserId(): Promise<string | null> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) {
      this.logSupabaseFailure('Unable to read the customer session.', error);
      throw error;
    }

    return data.session?.user.id ?? null;
  }

  private logSupabaseFailure(
    message: string,
    error: unknown,
    context: Readonly<Record<string, unknown>> = {},
  ): void {
    const errorRecord =
      typeof error === 'object' && error !== null
        ? error as Record<string, unknown>
        : {};

    console.warn(message, {
      ...context,
      code: errorRecord['code'] ?? null,
      message: errorRecord['message'] ?? String(error),
      details: errorRecord['details'] ?? null,
      hint: errorRecord['hint'] ?? null,
      error,
    });
  }

  private readGuestIds(): string[] {
    const storage = this.localStorage;
    if (!storage) return [];

    try {
      const storedValue = storage.getItem(GUEST_HISTORY_KEY);
      if (!storedValue) return [];

      const parsed: unknown = JSON.parse(storedValue);
      if (!Array.isArray(parsed)) return [];

      const productIds: string[] = [];
      const seen = new Set<string>();

      for (const value of parsed) {
        if (typeof value !== 'string') continue;
        const productId = value.trim();
        if (!productId || seen.has(productId)) continue;
        seen.add(productId);
        productIds.push(productId);
        if (productIds.length === MAX_GUEST_PRODUCTS) break;
      }

      return productIds;
    } catch {
      return [];
    }
  }

  private writeGuestIds(productIds: readonly string[]): void {
    const storage = this.localStorage;
    if (!storage) return;
    storage.setItem(GUEST_HISTORY_KEY, JSON.stringify(productIds.slice(0, MAX_GUEST_PRODUCTS)));
  }

  private removeGuestHistory(): void {
    this.localStorage?.removeItem(GUEST_HISTORY_KEY);
  }

  private normalizeLimit(limit: number): number {
    if (!Number.isFinite(limit)) return MAX_HOMEPAGE_PRODUCTS;
    return Math.min(MAX_HOMEPAGE_PRODUCTS, Math.max(1, Math.trunc(limit)));
  }

  private get localStorage(): Storage | null {
    if (typeof window === 'undefined') return null;

    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }
}
