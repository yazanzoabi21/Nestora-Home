import { TestBed } from '@angular/core/testing';
import type { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { Promotion } from '../../../data-access';
import { CustomerPromotionsService } from './customer-promotions.service';

interface QueryResult {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

const ACTIVE_PROMOTION: Promotion = {
  id: 'promotion-a',
  slug: 'promotion-a',
  title: 'Promotion A',
  is_active: true,
};

const EXPIRED_PROMOTION: Promotion = {
  ...ACTIVE_PROMOTION,
  id: 'promotion-expired',
  slug: 'promotion-expired',
  title: 'Expired promotion',
  end_date: '2000-01-02T00:00:00.000Z',
};

describe('CustomerPromotionsService caching', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('deduplicates and caches Flash Deals requests while preserving active filtering', async () => {
    const { service, flashQuery } = configureService();
    const pendingResult = createDeferred<QueryResult>();
    flashQuery.mockReturnValueOnce(pendingResult.promise);

    const firstRequest = service.getFlashDealPromotions();
    const concurrentRequest = service.getFlashDealPromotions();

    expect(concurrentRequest).toBe(firstRequest);
    expect(flashQuery).toHaveBeenCalledTimes(1);

    pendingResult.resolve({
      data: [ACTIVE_PROMOTION, EXPIRED_PROMOTION],
      error: null,
    });

    const promotions = await firstRequest;
    expect(promotions.map((promotion) => promotion.id)).toEqual(['promotion-a']);
    expect(await service.getFlashDealPromotions()).toBe(promotions);
    expect(flashQuery).toHaveBeenCalledTimes(1);
  });

  it('deduplicates promotion details per slug and loads different slugs independently', async () => {
    const { service, detailQuery } = configureService();
    const firstPromotion = promotionDetailsRecord('promotion-a', 'Promotion A');
    const secondPromotion = promotionDetailsRecord('promotion-b', 'Promotion B');
    const firstPendingResult = createDeferred<QueryResult>();

    detailQuery.mockImplementation((slug) => {
      if (slug === 'promotion-a') return firstPendingResult.promise;
      return Promise.resolve({ data: secondPromotion, error: null });
    });

    const firstRequest = service.getPromotionBySlug('promotion-a');
    const concurrentRequest = service.getPromotionBySlug('promotion-a');
    const differentSlugRequest = service.getPromotionBySlug('promotion-b');

    expect(concurrentRequest).toBe(firstRequest);
    expect(detailQuery).toHaveBeenCalledTimes(2);

    firstPendingResult.resolve({ data: firstPromotion, error: null });

    const firstResult = await firstRequest;
    expect((await differentSlugRequest)?.title).toBe('Promotion B');
    expect(await service.getPromotionBySlug('promotion-a')).toBe(firstResult);
    expect(detailQuery).toHaveBeenCalledTimes(2);
  });

  it('retries failures and prevents cleared in-flight requests from repopulating the cache', async () => {
    const { service, detailQuery } = configureService();
    const staleResult = createDeferred<QueryResult>();
    const freshPromotion = promotionDetailsRecord('promotion-a', 'Fresh promotion');

    detailQuery
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockReturnValueOnce(staleResult.promise)
      .mockResolvedValueOnce({ data: freshPromotion, error: null });

    await expect(service.getPromotionBySlug('promotion-a')).rejects.toThrow('Temporary failure');

    const staleRequest = service.getPromotionBySlug('promotion-a');
    service.clearPromotionCache();
    const freshRequest = service.getPromotionBySlug('promotion-a');

    staleResult.resolve({
      data: promotionDetailsRecord('promotion-a', 'Stale promotion'),
      error: null,
    });

    await staleRequest;
    const freshResult = await freshRequest;

    expect(freshResult?.title).toBe('Fresh promotion');
    expect(await service.getPromotionBySlug('promotion-a')).toBe(freshResult);
    expect(detailQuery).toHaveBeenCalledTimes(3);
  });
});

function configureService(): {
  readonly service: CustomerPromotionsService;
  readonly flashQuery: ReturnType<typeof vi.fn<() => Promise<QueryResult>>>;
  readonly detailQuery: ReturnType<typeof vi.fn<(slug: string) => Promise<QueryResult>>>;
} {
  const flashQuery = vi.fn<() => Promise<QueryResult>>();
  const detailQuery = vi.fn<(slug: string) => Promise<QueryResult>>();
  const select = vi.fn((query: string) => {
    if (query.includes('promotion_products')) {
      return {
        eq: vi.fn((_column: string, slug: string) => ({
          order: vi.fn(() => ({
            maybeSingle: vi.fn(() => detailQuery(slug)),
          })),
        })),
      };
    }

    const listBuilder = {
      eq: vi.fn(),
      order: vi.fn(() => flashQuery()),
    };
    listBuilder.eq.mockReturnValue(listBuilder);
    return listBuilder;
  });
  const supabase = {
    from: vi.fn(() => ({ select })),
  } as unknown as SupabaseClient;

  TestBed.configureTestingModule({
    providers: [
      CustomerPromotionsService,
      { provide: CUSTOMER_SUPABASE, useValue: supabase },
    ],
  });

  return {
    service: TestBed.inject(CustomerPromotionsService),
    flashQuery,
    detailQuery,
  };
}

function promotionDetailsRecord(slug: string, title: string): Promotion & {
  readonly promotion_products: readonly [];
} {
  return {
    ...ACTIVE_PROMOTION,
    id: slug,
    slug,
    title,
    promotion_products: [],
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
