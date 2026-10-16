import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { CustomerCatalogService } from './customer-catalog.service';
import { CustomerReviewsService } from './customer-reviews.service';
import { CustomerProductVideosService } from './customer-product-videos.service';

describe('CustomerCatalogService cache and lookup boundaries', () => {
  const query = vi.fn();
  const eq = vi.fn();
  let service: CustomerCatalogService;

  beforeEach(() => {
    localStorage.clear();
    query.mockReset().mockResolvedValue({ data: [], error: null });
    const builder = {
      order: vi.fn(), eq,
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        query().then(resolve, reject),
    };
    builder.order.mockReturnValue(builder);
    eq.mockReset().mockReturnValue(builder);
    const channel = { on: vi.fn(), subscribe: vi.fn() };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    TestBed.configureTestingModule({ providers: [
      { provide: CUSTOMER_SUPABASE, useValue: {
        from: vi.fn(() => ({ select: vi.fn(() => builder) })),
        channel: vi.fn(() => channel), removeChannel: vi.fn(async () => 'ok'),
      } },
      { provide: CustomerReviewsService, useValue: {
        getPublishedReviewCountsByProduct: vi.fn(async () => new Map<string, number>()),
      } },
      { provide: CustomerProductVideosService, useValue: {} },
    ] });
    service = TestBed.inject(CustomerCatalogService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('shares concurrent catalog requests and caches an empty catalog', async () => {
    await Promise.all([service.getProducts(), service.getProducts()]);
    await service.getProducts();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('renders the stale local cache while a background refresh fails', async () => {
    vi.useFakeTimers();
    localStorage.setItem('nestora_customer_products_v1', JSON.stringify({
      data: [], timestamp: Date.now() - 360_000, stale: true,
    }));
    query.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(service.getProducts()).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(service.productsSnapshot()).toEqual([]);
    expect(service.refreshError()).toBe('offline');
  });

  it('does not send a missing slug to the UUID id column', async () => {
    await expect(service.getProductDetails('missing-product')).resolves.toBeNull();
    expect(eq).toHaveBeenCalledExactlyOnceWith('slug', 'missing-product');
  });

  it('retains UUID fallback for existing identifier links', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    await expect(service.getProductDetails(id)).resolves.toBeNull();
    expect(eq).toHaveBeenCalledWith('id', id);
  });
});
