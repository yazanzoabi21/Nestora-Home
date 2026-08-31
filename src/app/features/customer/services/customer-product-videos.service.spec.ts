import { TestBed } from '@angular/core/testing';
import type { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { ProductVideoRow } from '../../../data-access/models';
import { CustomerProductVideosService } from './customer-product-videos.service';

interface QueryResult {
  readonly data: readonly ProductVideoRow[];
  readonly error: { readonly message: string } | null;
}

const VIDEO_ROW: ProductVideoRow = {
  id: 'video-a',
  product_id: 'product-a',
  storage_path: 'product-a/video-a.mp4',
  poster_url: null,
  sort_order: 0,
  is_active: true,
  created_at: '2026-08-31T00:00:00.000Z',
};

describe('CustomerProductVideosService caching', () => {
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('deduplicates concurrent requests and caches empty arrays', async () => {
    const pendingResult = createDeferred<QueryResult>();
    const { service, query } = configureService(() => pendingResult.promise);

    const firstRequest = service.getVideosForProduct('product-a');
    const concurrentRequest = service.getVideosForProduct('product-a');
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(1);

    pendingResult.resolve({ data: [], error: null });
    await expect(firstRequest).resolves.toEqual([]);
    await expect(concurrentRequest).resolves.toEqual([]);
    await expect(service.getVideosForProduct('product-a')).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('hydrates a valid product entry from localStorage without querying Supabase', async () => {
    window.localStorage.setItem(
      'nestora_customer_product_videos_v1',
      JSON.stringify({
        'product-a': {
          data: [{
            id: VIDEO_ROW.id,
            productId: VIDEO_ROW.product_id,
            storagePath: VIDEO_ROW.storage_path,
            posterUrl: VIDEO_ROW.poster_url,
            sortOrder: VIDEO_ROW.sort_order,
            isActive: VIDEO_ROW.is_active,
            createdAt: VIDEO_ROW.created_at,
            url: 'https://example.test/product-a/video-a.mp4',
          }],
          timestamp: Date.now(),
        },
      }),
    );
    const { service, query } = configureService(async () => ({ data: [], error: null }));

    const videos = await service.getVideosForProduct('product-a');

    expect(videos.map((video) => video.id)).toEqual(['video-a']);
    expect(query).not.toHaveBeenCalled();
  });

  it('coalesces realtime events and refreshes only the affected product', async () => {
    vi.useFakeTimers();
    let rows: readonly ProductVideoRow[] = [];
    const { service, query, emitRealtime } = configureService(async () => ({
      data: rows,
      error: null,
    }));
    await service.getVideosForProduct('product-a');
    rows = [VIDEO_ROW];

    emitRealtime({ new: { product_id: 'product-a' }, old: {} });
    emitRealtime({ new: { product_id: 'product-a' }, old: {} });
    await vi.runAllTimersAsync();

    expect(query).toHaveBeenCalledTimes(2);
    expect(service.videosSnapshot()['product-a']?.map((video) => video.id)).toEqual(['video-a']);
    expect(service.realtimeChange().productIds).toEqual(['product-a']);
  });
});

function configureService(loadResult: () => Promise<QueryResult>): {
  readonly service: CustomerProductVideosService;
  readonly query: ReturnType<typeof vi.fn<() => Promise<QueryResult>>>;
  emitRealtime(payload: unknown): void;
} {
  const query = vi.fn(loadResult);
  let realtimeHandler: ((payload: unknown) => void) | null = null;
  const builder = {
    eq: vi.fn(),
    order: vi.fn(),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject: (reason: unknown) => unknown,
    ): Promise<unknown> => query().then(resolve, reject),
  };
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  const channel = {
    on: vi.fn((_type, _filter, handler: (payload: unknown) => void) => {
      realtimeHandler = handler;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  const supabase = {
    from: vi.fn(() => ({ select: vi.fn(() => builder) })),
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: vi.fn((path: string) => ({
          data: { publicUrl: `https://example.test/${path}` },
        })),
      })),
    },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
  } as unknown as SupabaseClient;

  TestBed.configureTestingModule({
    providers: [
      CustomerProductVideosService,
      { provide: CUSTOMER_SUPABASE, useValue: supabase },
    ],
  });

  return {
    service: TestBed.inject(CustomerProductVideosService),
    query,
    emitRealtime(payload: unknown): void {
      if (!realtimeHandler) throw new Error('Realtime handler was not registered.');
      realtimeHandler(payload);
    },
  };
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      resolvePromise(value);
    },
  };
}
