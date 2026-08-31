import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';

import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { ProductVideo, ProductVideoRow } from '../../../data-access/models';

interface ProductVideosCacheEntry {
  readonly data: readonly ProductVideo[];
  readonly timestamp: number;
  readonly stale?: boolean;
}

type ProductVideosPersistentCache = Readonly<Record<string, ProductVideosCacheEntry>>;

export interface CustomerProductVideosRealtimeChange {
  readonly revision: number;
  readonly productIds: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class CustomerProductVideosService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly cacheKey = 'nestora_customer_product_videos_v1';
  private readonly cacheTtlMs = 5 * 60 * 1000;
  private readonly realtimeDebounceMs = 200;
  private readonly realtimeChannelName = 'customer-product-videos-cache-invalidation';

  private readonly memoryCache = new Map<string, ProductVideosCacheEntry>();
  private readonly pendingRequests = new Map<string, Promise<ProductVideo[]>>();
  private readonly invalidationRevisions = new Map<string, number>();
  private readonly backgroundRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingRealtimeProductIds = new Set<string>();
  private realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private realtimeChannel: RealtimeChannel | null = null;

  private readonly videosState = signal<
    Readonly<Record<string, readonly ProductVideo[]>>
  >({});
  readonly videosSnapshot = this.videosState.asReadonly();

  private readonly realtimeChangeState = signal<CustomerProductVideosRealtimeChange>({
    revision: 0,
    productIds: [],
  });
  readonly realtimeChange = this.realtimeChangeState.asReadonly();

  private readonly refreshErrorState = signal<string | null>(null);
  readonly refreshError = this.refreshErrorState.asReadonly();

  constructor() {
    this.startRealtime();
    this.destroyRef.onDestroy(() => this.stopRealtime());
  }

  async getVideosForProduct(productId: string, forceRefresh = false): Promise<ProductVideo[]> {
    const normalizedProductId = productId.trim();
    if (!normalizedProductId) return [];

    const memoryEntry = this.memoryCache.get(normalizedProductId);
    if (!forceRefresh && memoryEntry && this.isUsable(memoryEntry)) {
      this.publishVideos(normalizedProductId, memoryEntry.data);
      return [...memoryEntry.data];
    }

    const persistentCache = this.readPersistentCache();
    const persistentEntry = persistentCache?.[normalizedProductId];
    if (
      persistentEntry &&
      (!memoryEntry || persistentEntry.timestamp > memoryEntry.timestamp)
    ) {
      this.memoryCache.set(normalizedProductId, persistentEntry);
      this.publishVideos(normalizedProductId, persistentEntry.data);
    }

    const cachedEntry = this.memoryCache.get(normalizedProductId);
    if (!forceRefresh && cachedEntry) {
      if (!this.isUsable(cachedEntry)) this.scheduleBackgroundRefresh(normalizedProductId);
      return [...cachedEntry.data];
    }

    return this.fetchVideosForProduct(normalizedProductId);
  }

  refreshVideosForProduct(productId: string): Promise<ProductVideo[]> {
    return this.getVideosForProduct(productId, true);
  }

  invalidateProductVideos(productId: string): void {
    const normalizedProductId = productId.trim();
    if (!normalizedProductId) return;

    this.invalidationRevisions.set(
      normalizedProductId,
      (this.invalidationRevisions.get(normalizedProductId) ?? 0) + 1,
    );

    const memoryEntry = this.memoryCache.get(normalizedProductId);
    if (memoryEntry) {
      this.memoryCache.set(normalizedProductId, { ...memoryEntry, stale: true });
    }

    const persistentCache = this.readPersistentCache();
    const persistentEntry = persistentCache?.[normalizedProductId];
    if (persistentCache && persistentEntry) {
      this.writePersistentCache({
        ...persistentCache,
        [normalizedProductId]: { ...persistentEntry, stale: true },
      });
    }
  }

  private async fetchVideosForProduct(productId: string): Promise<ProductVideo[]> {
    const pendingRequest = this.pendingRequests.get(productId);
    if (pendingRequest) return pendingRequest;

    const fallback = this.memoryCache.get(productId);
    const requestRevision = this.invalidationRevisions.get(productId) ?? 0;
    const request = (async (): Promise<ProductVideo[]> => {
      try {
        const { data, error } = await this.supabase
          .from('product_videos')
          .select('id, product_id, storage_path, poster_url, sort_order, is_active, created_at')
          .eq('product_id', productId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });

        if (error) throw new Error(error.message);

        const videos = (data ?? []).map((value) => this.mapVideo(value as ProductVideoRow));
        const invalidatedDuringRequest =
          requestRevision !== (this.invalidationRevisions.get(productId) ?? 0);
        const entry: ProductVideosCacheEntry = {
          data: videos,
          timestamp: Date.now(),
          stale: invalidatedDuringRequest,
        };

        this.memoryCache.set(productId, entry);
        this.publishVideos(productId, videos);
        this.writeProductEntry(productId, entry);
        this.refreshErrorState.set(null);
        return [...videos];
      } catch (error) {
        this.refreshErrorState.set(
          error instanceof Error ? error.message : 'Unable to load product videos.',
        );
        if (fallback) return [...fallback.data];
        throw error;
      }
    })();

    this.pendingRequests.set(productId, request);
    try {
      return await request;
    } finally {
      if (this.pendingRequests.get(productId) === request) {
        this.pendingRequests.delete(productId);
      }
    }
  }

  private mapVideo(row: ProductVideoRow): ProductVideo {
    const url = this.supabase.storage.from('product-videos').getPublicUrl(row.storage_path).data
      .publicUrl;
    return {
      id: row.id,
      productId: row.product_id,
      storagePath: row.storage_path,
      posterUrl: row.poster_url,
      sortOrder: Number(row.sort_order ?? 0),
      isActive: row.is_active !== false,
      createdAt: row.created_at,
      url,
    };
  }

  private scheduleBackgroundRefresh(productId: string): void {
    if (this.backgroundRefreshTimers.has(productId) || this.pendingRequests.has(productId)) return;

    const timer = setTimeout(() => {
      this.backgroundRefreshTimers.delete(productId);
      void this.refreshVideosForProduct(productId).catch(() => undefined);
    }, 0);
    this.backgroundRefreshTimers.set(productId, timer);
  }

  private handleRealtimeChange(payload: unknown): void {
    const productIds = this.collectAffectedProductIds(payload);
    if (productIds.length === 0) return;

    for (const productId of productIds) {
      this.invalidateProductVideos(productId);
      this.pendingRealtimeProductIds.add(productId);
    }

    if (this.realtimeRefreshTimer) clearTimeout(this.realtimeRefreshTimer);
    this.realtimeRefreshTimer = setTimeout(() => {
      this.realtimeRefreshTimer = null;
      void this.refreshAfterRealtimeChange();
    }, this.realtimeDebounceMs);
  }

  private collectAffectedProductIds(payload: unknown): string[] {
    if (!this.isRecord(payload)) return [];

    const productIds = new Set<string>();
    const records = [payload['new'], payload['old']].filter((value) => this.isRecord(value));
    for (const record of records) {
      const productId = record['product_id'];
      if (typeof productId === 'string' && productId.trim()) productIds.add(productId);
    }

    if (productIds.size === 0) {
      for (const record of records) {
        const videoId = record['id'];
        if (typeof videoId !== 'string') continue;
        const cachedProductId = this.findCachedProductId(videoId);
        if (cachedProductId) productIds.add(cachedProductId);
      }
    }

    return [...productIds];
  }

  private findCachedProductId(videoId: string): string | null {
    for (const [productId, entry] of this.memoryCache) {
      if (entry.data.some((video) => video.id === videoId)) return productId;
    }

    const persistentCache = this.readPersistentCache();
    if (!persistentCache) return null;
    return (
      Object.entries(persistentCache).find(([, entry]) =>
        entry.data.some((video) => video.id === videoId),
      )?.[0] ?? null
    );
  }

  private async refreshAfterRealtimeChange(): Promise<void> {
    const productIds = [...this.pendingRealtimeProductIds];
    this.pendingRealtimeProductIds.clear();

    await Promise.allSettled(productIds.map((productId) => this.refreshRealtimeProduct(productId)));
    const refreshedProductIds = productIds.filter(
      (productId) => {
        const entry = this.memoryCache.get(productId);
        return entry !== undefined && entry.stale !== true;
      },
    );
    if (refreshedProductIds.length === 0) return;

    this.realtimeChangeState.update((change) => ({
      revision: change.revision + 1,
      productIds: refreshedProductIds,
    }));
  }

  private async refreshRealtimeProduct(productId: string): Promise<void> {
    await this.refreshVideosForProduct(productId);
  }

  private publishVideos(productId: string, videos: readonly ProductVideo[]): void {
    const current = this.videosState()[productId];
    if (current && this.sameVideos(current, videos)) return;

    this.videosState.update((snapshot) => ({
      ...snapshot,
      [productId]: [...videos],
    }));
  }

  private sameVideos(current: readonly ProductVideo[], incoming: readonly ProductVideo[]): boolean {
    if (current.length !== incoming.length) return false;
    if (current.every((video, index) => video === incoming[index])) return true;
    return JSON.stringify(current) === JSON.stringify(incoming);
  }

  private isUsable(entry: ProductVideosCacheEntry): boolean {
    const age = Date.now() - entry.timestamp;
    return entry.stale !== true && age >= 0 && age < this.cacheTtlMs;
  }

  private readPersistentCache(): ProductVideosPersistentCache | null {
    const storage = this.getStorage();
    if (!storage) return null;

    try {
      const serialized = storage.getItem(this.cacheKey);
      if (!serialized) return null;
      const parsed: unknown = JSON.parse(serialized);
      if (!this.isPersistentCache(parsed)) {
        storage.removeItem(this.cacheKey);
        return null;
      }
      return parsed;
    } catch {
      try {
        storage.removeItem(this.cacheKey);
      } catch {
        // Browser storage can become unavailable between reads and cleanup.
      }
      return null;
    }
  }

  private writeProductEntry(productId: string, entry: ProductVideosCacheEntry): void {
    this.writePersistentCache({
      ...(this.readPersistentCache() ?? {}),
      [productId]: entry,
    });
  }

  private writePersistentCache(cache: ProductVideosPersistentCache): void {
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

  private isPersistentCache(value: unknown): value is ProductVideosPersistentCache {
    return (
      this.isRecord(value) &&
      Object.values(value).every((entry) => this.isProductVideosCacheEntry(entry))
    );
  }

  private isProductVideosCacheEntry(value: unknown): value is ProductVideosCacheEntry {
    return (
      this.isRecord(value) &&
      Array.isArray(value['data']) &&
      value['data'].every((video) => this.isProductVideo(video)) &&
      typeof value['timestamp'] === 'number' &&
      Number.isFinite(value['timestamp']) &&
      (value['stale'] === undefined || typeof value['stale'] === 'boolean')
    );
  }

  private isProductVideo(value: unknown): value is ProductVideo {
    return (
      this.isRecord(value) &&
      typeof value['id'] === 'string' &&
      typeof value['productId'] === 'string' &&
      typeof value['storagePath'] === 'string' &&
      (value['posterUrl'] === null || typeof value['posterUrl'] === 'string') &&
      typeof value['sortOrder'] === 'number' &&
      Number.isFinite(value['sortOrder']) &&
      typeof value['isActive'] === 'boolean' &&
      typeof value['createdAt'] === 'string' &&
      typeof value['url'] === 'string'
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private startRealtime(): void {
    if (this.realtimeChannel) return;
    this.realtimeChannel = this.supabase
      .channel(this.realtimeChannelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_videos' },
        (payload) => this.handleRealtimeChange(payload),
      )
      .subscribe();
  }

  private stopRealtime(): void {
    for (const timer of this.backgroundRefreshTimers.values()) clearTimeout(timer);
    this.backgroundRefreshTimers.clear();
    if (this.realtimeRefreshTimer) clearTimeout(this.realtimeRefreshTimer);
    this.realtimeRefreshTimer = null;
    if (!this.realtimeChannel) return;
    const channel = this.realtimeChannel;
    this.realtimeChannel = null;
    void this.supabase.removeChannel(channel);
  }
}
