import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';

import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { Product } from '../../../data-access/models';
import { CustomerProduct, CustomerProductDetails, CustomerProductVariant } from '../models';
import { CustomerReviewsService } from './customer-reviews.service';

const PRODUCT_SELECT = `
  id,
  category_id,
  media_id,
  name,
  slug,
  description,
  short_description,
  sku,
  image_url,
  gallery,
  features,
  price,
  sale_price,
  stock,
  sold_count,
  is_featured,
  is_new,
  is_active,
  is_loyalty_eligible,
  rating,
  created_at,
  categories (
    id,
    name,
    slug
  ),
  product_variants (
    id,
    product_id,
    option_name,
    option_value,
    name,
    sku,
    price,
    sale_price,
    stock,
    attributes,
    media_id,
    image_url,
    is_active,
    sort_order,
    created_at,
    updated_at
  )
`;

interface ProductCacheEntry {
  readonly data: CustomerProduct[];
  readonly timestamp: number;
  readonly stale?: boolean;
}

type CatalogRealtimeTable = 'products' | 'product_variants' | 'categories';

export interface CustomerCatalogRealtimeChange {
  readonly revision: number;
  readonly productIds: readonly string[];
  readonly categoryIds: readonly string[];
  readonly affectsAllProducts: boolean;
}

@Injectable({ providedIn: 'root' })
export class CustomerCatalogService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly reviewsService = inject(CustomerReviewsService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly cacheKey = 'nestora_customer_products_v1';
  private readonly cacheTtlMs = 5 * 60 * 1000;
  private readonly backgroundRevalidationIntervalMs = 60 * 1000;
  private readonly realtimeDebounceMs = 200;
  private readonly realtimeChannelName = 'customer-products-cache-invalidation';

  private memoryCache: CustomerProduct[] | null = null;
  private memoryCacheTimestamp = 0;
  private cacheStale = false;
  private invalidationRevision = 0;
  private pendingRequest: Promise<CustomerProduct[]> | null = null;
  private reuseCachedReviewStats = false;
  private realtimeChannel: RealtimeChannel | null = null;
  private backgroundRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBackgroundRevalidationAt = 0;
  private pendingRealtimeAffectsAllProducts = false;
  private readonly pendingRealtimeProductIds = new Set<string>();
  private readonly pendingRealtimeCategoryIds = new Set<string>();

  private readonly refreshErrorState = signal<string | null>(null);
  readonly refreshError = this.refreshErrorState.asReadonly();

  private readonly productsState =
    signal<CustomerProduct[] | null>(null);

  readonly productsSnapshot =
    this.productsState.asReadonly();

  private readonly realtimeChangeState = signal<CustomerCatalogRealtimeChange>({
    revision: 0,
    productIds: [],
    categoryIds: [],
    affectsAllProducts: false,
  });
  readonly realtimeChange = this.realtimeChangeState.asReadonly();

  constructor() {
    this.startProductRealtime();
    this.destroyRef.onDestroy(() => this.stopProductRealtime());
  }

  async getProducts(forceRefresh = false): Promise<CustomerProduct[]> {
    if (!forceRefresh && this.hasFreshMemoryCache()) {
      this.publishProducts(this.memoryCache!);
      this.scheduleAgeBasedRevalidation(this.memoryCacheTimestamp);
      return [...this.memoryCache!];
    }

    const persistentCache = this.readPersistentCache();
    if (persistentCache && this.shouldHydrateMemory(persistentCache)) {
      this.memoryCache = persistentCache.data;
      this.memoryCacheTimestamp = persistentCache.timestamp;
      this.cacheStale ||= persistentCache.stale === true;
      this.publishProducts(persistentCache.data);
    }

    if (!forceRefresh && this.memoryCache) {
      if (!this.isUsable({
        data: this.memoryCache,
        timestamp: this.memoryCacheTimestamp,
        stale: this.cacheStale,
      })) {
        this.scheduleBackgroundRefresh();
      } else {
        this.scheduleAgeBasedRevalidation(this.memoryCacheTimestamp);
      }

      return [...this.memoryCache];
    }

    if (!forceRefresh && persistentCache && this.isUsable(persistentCache)) {
      return [...persistentCache.data];
    }

    return this.fetchProducts();
  }

  refreshProducts(): Promise<CustomerProduct[]> {
    return this.getProducts(true);
  }

  invalidateProductsCache(): void {
    this.cacheStale = true;
    this.invalidationRevision += 1;

    const cached = this.readPersistentCache();
    if (cached) {
      this.writePersistentCache({ ...cached, stale: true });
    }
  }

  async getNewArrivals(): Promise<CustomerProduct[]> {
    const products = await this.getProducts();
    return products.filter((product) => product.isNew);
  }

  async getBestSellers(): Promise<CustomerProduct[]> {
    const products = await this.getProducts();
    return products.sort(
      (first, second) =>
        second.soldCount - first.soldCount ||
        second.rating - first.rating ||
        second.reviewCount - first.reviewCount,
    );
  }

  async getProductsByIds(ids: readonly string[]): Promise<CustomerProduct[]> {
    const uniqueIds = [...new Set(ids.filter((id) => Boolean(id.trim())))];
    if (uniqueIds.length === 0) return [];

    const products = await this.getProducts();
    const productsById = new Map(products.map((product) => [product.id, product]));

    return uniqueIds.flatMap((id) => {
      const product = productsById.get(id);
      return product ? [product] : [];
    });
  }

  async getProductDetails(identifier: string): Promise<CustomerProductDetails | null> {
    const product =
      (await this.getProductBySlug(identifier)) ?? (await this.getProductById(identifier));
    if (!product || product.is_active === false) {
      return null;
    }
    const reviews = await this.reviewsService.getPublishedReviewsByProduct(product.id);
    const mapped = this.withPublishedReviewStats(this.toCustomerProduct(product, false), reviews);
    return {
      ...mapped,
      longDescription: product.description || undefined,
      gallery: this.galleryUrls(product),
      sku: product.sku,
      variants: (product.product_variants ?? [])
        .filter((variant) => variant.is_active !== false)
        .map((variant): CustomerProductVariant => ({
          id: variant.id,
          optionName: variant.option_name,
          optionValue: variant.option_value,
          name: variant.name,
          sku: variant.sku,
          price: variant.price === null ? null : Number(variant.price),
          salePrice: variant.sale_price === null ? null : Number(variant.sale_price),
          stock: variant.stock === null ? null : Math.max(0, Number(variant.stock)),
          attributes: variant.attributes ?? {},
          imageUrl: variant.image_url,
          isActive: variant.is_active !== false,
          sortOrder: Number(variant.sort_order ?? 0),
        }))
        .sort((left, right) => left.sortOrder - right.sortOrder),
      features: Array.isArray(product.features)
        ? product.features.filter(
          (feature): feature is string => typeof feature === 'string' && !!feature.trim(),
        )
        : [],
    };
  }

  private async fetchProducts(): Promise<CustomerProduct[]> {
    if (this.pendingRequest) {
      return this.pendingRequest;
    }

    const fallback = this.memoryCache ? [...this.memoryCache] : null;
    const requestRevision = this.invalidationRevision;

    this.pendingRequest = (async () => {
      try {
        const { data, error } = await this.supabase
          .from('products')
          .select(PRODUCT_SELECT)
          .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);

        const products = await this.mapCustomerProducts(
          (data ?? [])
            .map((product) => this.mapProduct(product as Product))
            .filter((product) => product.is_active !== false),
        );
        const invalidatedDuringRequest = requestRevision !== this.invalidationRevision;
        const timestamp = Date.now();

        this.memoryCache = products;
        this.memoryCacheTimestamp = timestamp;
        this.publishProducts(products);
        this.cacheStale = invalidatedDuringRequest;
        this.refreshErrorState.set(null);
        this.writePersistentCache({ data: products, timestamp, stale: invalidatedDuringRequest });

        return [...products];
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load products.';
        this.refreshErrorState.set(message);

        if (fallback) {

          return fallback;
        }

        throw error;
      }
    })();

    try {
      return await this.pendingRequest;
    } finally {
      this.pendingRequest = null;
    }
  }

  private handleCatalogRealtimeChange(table: CatalogRealtimeTable, payload: unknown): void {
    this.collectRealtimeTargets(table, payload);
    this.invalidateProductsCache();

    if (this.realtimeRefreshTimer) clearTimeout(this.realtimeRefreshTimer);
    this.realtimeRefreshTimer = setTimeout(() => {
      this.realtimeRefreshTimer = null;
      void this.refreshAfterRealtimeChange();
    }, this.realtimeDebounceMs);
  }

  private async refreshAfterRealtimeChange(): Promise<void> {
    this.reuseCachedReviewStats = true;
    try {
      await this.refreshProducts();
      if (this.cacheStale) {
        await Promise.resolve();
        await this.refreshProducts();
      }

      if (!this.cacheStale) this.publishRealtimeChange();
    } catch (error) {

    } finally {
      this.reuseCachedReviewStats = false;
    }
  }

  private scheduleAgeBasedRevalidation(timestamp: number): void {
    const now = Date.now();
    if (
      now - timestamp >= this.backgroundRevalidationIntervalMs &&
      now - this.lastBackgroundRevalidationAt >= this.backgroundRevalidationIntervalMs
    ) {
      this.scheduleBackgroundRefresh();
    }
  }

  private scheduleBackgroundRefresh(): void {
    if (this.backgroundRefreshTimer || this.pendingRequest) return;

    this.backgroundRefreshTimer = setTimeout(() => {
      this.backgroundRefreshTimer = null;
      this.lastBackgroundRevalidationAt = Date.now();
      void this.refreshProducts().catch((error) => {

      });
    }, 0);
  }

  private publishProducts(products: readonly CustomerProduct[]): void {
    const snapshot = [...products];
    if (!this.sameProducts(this.productsState(), snapshot)) {
      this.productsState.set(snapshot);
    }
  }

  private sameProducts(
    current: readonly CustomerProduct[] | null,
    incoming: readonly CustomerProduct[],
  ): boolean {
    if (!current || current.length !== incoming.length) return false;
    if (current.every((product, index) => product === incoming[index])) return true;
    return JSON.stringify(current) === JSON.stringify(incoming);
  }

  private hasFreshMemoryCache(): boolean {
    return (
      this.memoryCache !== null &&
      !this.cacheStale &&
      this.isFreshTimestamp(this.memoryCacheTimestamp)
    );
  }

  private isUsable(cache: ProductCacheEntry): boolean {
    return !this.cacheStale && cache.stale !== true && this.isFreshTimestamp(cache.timestamp);
  }

  private isFreshTimestamp(timestamp: number): boolean {
    const age = Date.now() - timestamp;
    return age >= 0 && age < this.cacheTtlMs;
  }

  private shouldHydrateMemory(cache: ProductCacheEntry): boolean {
    return this.memoryCache === null || cache.timestamp > this.memoryCacheTimestamp;
  }

  private readPersistentCache(): ProductCacheEntry | null {
    const storage = this.getStorage();
    if (!storage) return null;

    try {
      const serialized = storage.getItem(this.cacheKey);
      if (!serialized) return null;

      const parsed: unknown = JSON.parse(serialized);
      if (!this.isProductCacheEntry(parsed)) {
        storage.removeItem(this.cacheKey);
        return null;
      }

      return parsed;
    } catch {
      try {
        storage.removeItem(this.cacheKey);
      } catch {
        // Storage may become unavailable between reads and writes.
      }
      return null;
    }
  }

  private writePersistentCache(cache: ProductCacheEntry): void {
    const storage = this.getStorage();
    if (!storage) return;

    try {
      storage.setItem(this.cacheKey, JSON.stringify(cache));
    } catch {
      // Memory caching remains available when browser storage is unavailable or full.
    }
  }

  private getStorage(): Storage | null {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }

  private isProductCacheEntry(value: unknown): value is ProductCacheEntry {
    if (!this.isRecord(value)) return false;
    if (!Array.isArray(value['data']) || !value['data'].every((item) => this.isCustomerProduct(item))) {
      return false;
    }
    if (typeof value['timestamp'] !== 'number' || !Number.isFinite(value['timestamp'])) return false;
    return value['stale'] === undefined || typeof value['stale'] === 'boolean';
  }

  private isCustomerProduct(value: unknown): value is CustomerProduct {
    if (!this.isRecord(value)) return false;
    return (
      typeof value['id'] === 'string' &&
      typeof value['name'] === 'string' &&
      typeof value['brand'] === 'string' &&
      typeof value['category'] === 'string' &&
      typeof value['imageUrl'] === 'string' &&
      typeof value['price'] === 'number' &&
      typeof value['rating'] === 'number' &&
      typeof value['reviewCount'] === 'number' &&
      typeof value['isFeatured'] === 'boolean' &&
      typeof value['isNew'] === 'boolean' &&
      typeof value['isActive'] === 'boolean' &&
      typeof value['isLoyaltyEligible'] === 'boolean' &&
      typeof value['soldCount'] === 'number' &&
      typeof value['inStock'] === 'boolean' &&
      typeof value['stock'] === 'number'
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private startProductRealtime(): void {
    if (this.realtimeChannel) return;

    this.realtimeChannel = this.supabase
      .channel(this.realtimeChannelName)

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
        },
        (payload) => this.handleCatalogRealtimeChange('products', payload),
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_variants',
        },
        (payload) => this.handleCatalogRealtimeChange('product_variants', payload),
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'categories',
        },
        (payload) => this.handleCatalogRealtimeChange('categories', payload),
      )

      .subscribe();
  }

  private stopProductRealtime(): void {
    if (this.backgroundRefreshTimer) clearTimeout(this.backgroundRefreshTimer);
    if (this.realtimeRefreshTimer) clearTimeout(this.realtimeRefreshTimer);
    this.backgroundRefreshTimer = null;
    this.realtimeRefreshTimer = null;
    if (!this.realtimeChannel) return;
    const channel = this.realtimeChannel;
    this.realtimeChannel = null;
    void this.supabase.removeChannel(channel);
  }

  private withPublishedReviewStats(
    product: CustomerProduct,
    reviews: Awaited<ReturnType<CustomerReviewsService['getPublishedReviewsByProduct']>>,
  ): CustomerProduct {
    const ratings = reviews.flatMap((review) => (review.rating === null ? [] : [review.rating]));
    return {
      ...product,
      rating: ratings.length
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0,
      reviewCount: reviews.length,
    };
  }

  private toCustomerProduct(product: Product, useDefaultVariant = true): CustomerProduct {
    const defaultVariant = useDefaultVariant
      ? (product.product_variants ?? [])
        .filter((variant) => variant.is_active !== false)
        .sort((left, right) => Number(left.sort_order) - Number(right.sort_order))[0]
      : undefined;
    const regularPrice = Number(defaultVariant?.price ?? product.price ?? 0);
    const salePrice =
      defaultVariant?.sale_price === null || defaultVariant?.sale_price === undefined
        ? product.sale_price === null
          ? null
          : Number(product.sale_price)
        : Number(defaultVariant.sale_price);
    const currentPrice = salePrice !== null && salePrice < regularPrice ? salePrice : regularPrice;
    const hasDiscount = regularPrice > 0 && currentPrice < regularPrice;
    const stock = Math.max(0, Number(defaultVariant?.stock ?? product.stock ?? 0));

    return {
      id: product.id,
      name: product.name,
      brand: 'Nestora',
      category: product.categoryName || 'Uncategorized',
      categoryId: product.category_id ?? null,
      imageUrl:
        defaultVariant?.image_url || product.image_url || 'assets/images/product-placeholder.png',
      description: product.short_description || product.description || undefined,
      price: currentPrice,
      originalPrice: hasDiscount ? regularPrice : null,
      rating: Number(product.rating ?? 0),
      reviewCount: 0,
      discountPercentage: hasDiscount
        ? Math.round(((regularPrice - currentPrice) / regularPrice) * 100)
        : null,
      badge: product.is_new ? 'New' : null,
      isFeatured: product.is_featured === true,
      isNew: product.is_new === true,
      isActive: product.is_active !== false,
      isLoyaltyEligible: product.is_loyalty_eligible !== false,
      soldCount: Math.max(0, Number(product.sold_count ?? 0)),
      inStock: product.is_active !== false && stock > 0,
      stock,
      createdAt: product.created_at,
      slug: product.slug,
      sku: defaultVariant?.sku ?? product.sku,
      variantId: defaultVariant?.id ?? null,
      variantLabel: defaultVariant
        ? defaultVariant.name || `${defaultVariant.option_name}: ${defaultVariant.option_value}`
        : null,
      variantOptionName: defaultVariant?.option_name ?? null,
      variantOptionValue: defaultVariant?.option_value ?? null,
      variantAttributes: defaultVariant?.attributes ?? {},
    };
  }

  private mapCustomerProducts(products: Product[]): Promise<CustomerProduct[]> {
    const cachedById = this.reuseCachedReviewStats
      ? new Map((this.memoryCache ?? []).map((product) => [product.id, product]))
      : new Map<string, CustomerProduct>();
    return Promise.all(
      products.map(async (product) => {
        const mapped = this.toCustomerProduct(product);
        const cached = cachedById.get(product.id);
        if (cached) {
          return { ...mapped, rating: cached.rating, reviewCount: cached.reviewCount };
        }

        return this.withPublishedReviewStats(
          mapped,
          await this.reviewsService.getPublishedReviewsByProduct(product.id),
        );
      }),
    );
  }

  private collectRealtimeTargets(table: CatalogRealtimeTable, payload: unknown): void {
    if (!this.isRecord(payload)) {
      this.pendingRealtimeAffectsAllProducts = true;
      return;
    }
    const records = [payload['new'], payload['old']].filter((value) => this.isRecord(value));
    let targetFound = false;

    for (const record of records) {
      if (table === 'products' && typeof record['id'] === 'string') {
        this.pendingRealtimeProductIds.add(record['id']);
        targetFound = true;
      } else if (table === 'product_variants' && typeof record['product_id'] === 'string') {
        this.pendingRealtimeProductIds.add(record['product_id']);
        targetFound = true;
      } else if (table === 'categories' && typeof record['id'] === 'string') {
        this.pendingRealtimeCategoryIds.add(record['id']);
        targetFound = true;
      }
    }

    if (!targetFound) this.pendingRealtimeAffectsAllProducts = true;
  }

  private publishRealtimeChange(): void {
    this.realtimeChangeState.update((change) => ({
      revision: change.revision + 1,
      productIds: [...this.pendingRealtimeProductIds],
      categoryIds: [...this.pendingRealtimeCategoryIds],
      affectsAllProducts: this.pendingRealtimeAffectsAllProducts,
    }));
    this.pendingRealtimeProductIds.clear();
    this.pendingRealtimeCategoryIds.clear();
    this.pendingRealtimeAffectsAllProducts = false;
  }

  private galleryUrls(product: Product): string[] {
    const gallery = Array.isArray(product.gallery) ? product.gallery : [];
    const urls = gallery
      .map((item) => (typeof item === 'string' ? item : item.url))
      .filter((url) => Boolean(url));
    return [...new Set([product.image_url, ...urls].filter((url): url is string => Boolean(url)))];
  }

  private async getProductBySlug(slug: string): Promise<Product | null> {
    const { data, error } = await this.supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? this.mapProduct(data as Product) : null;
  }

  private async getProductById(id: string): Promise<Product | null> {
    const { data, error } = await this.supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? this.mapProduct(data as Product) : null;
  }

  private mapProduct(product: Product): Product {
    const categories = product.categories;
    const category = Array.isArray(categories) ? categories[0] : categories;

    return {
      ...product,
      slug: product.slug || this.createSlug(product.name),
      sku: product.sku ?? null,
      media_id: product.media_id ?? null,
      stock: product.stock ?? null,
      sold_count: product.sold_count ?? null,
      is_featured: product.is_featured ?? null,
      is_new: product.is_new ?? null,
      is_active: product.is_active ?? null,
      rating: product.rating ?? null,
      product_variants: product.product_variants ?? [],
      categoryName: category?.name || 'Uncategorized',
    };
  }

  private createSlug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
