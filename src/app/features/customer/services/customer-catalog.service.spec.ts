import { TestBed } from '@angular/core/testing';
import { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { Product } from '../../../data-access/models';
import { CustomerCatalogService } from './customer-catalog.service';
import { CustomerReviewsService } from './customer-reviews.service';

interface QueryResponse {
  readonly data: Product[] | null;
  readonly error: { readonly message: string } | null;
}

interface CatalogTestContext {
  readonly service: CustomerCatalogService;
  readonly productQuery: ReturnType<typeof vi.fn>;
  setResponse(response: Promise<QueryResponse>): void;
}

const PRODUCT: Product = {
  id: 'product-1',
  category_id: 'category-1',
  media_id: null,
  name: 'Linen Cushion',
  slug: 'linen-cushion',
  description: 'A linen cushion.',
  short_description: 'Linen cushion',
  sku: 'LC-1',
  image_url: 'https://example.com/linen-cushion.webp',
  gallery: ['https://example.com/linen-cushion-detail.webp'],
  features: ['Linen cover'],
  price: 40,
  sale_price: 35,
  stock: 8,
  sold_count: 5,
  is_featured: true,
  is_new: true,
  is_active: true,
  is_loyalty_eligible: true,
  rating: 4.5,
  created_at: '2026-08-21T00:00:00.000Z',
  product_variants: [],
  categories: { id: 'category-1', name: 'Cushions', slug: 'cushions' },
};

describe('CustomerCatalogService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('reuses the memory cache and writes a persistent cache entry', async () => {
    const context = configureService();

    const first = await context.service.getProducts();
    const second = await context.service.getProducts();

    expect(context.productQuery).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(localStorage.getItem('nestora_customer_products_v1')).not.toBeNull();
  });

  it('deduplicates simultaneous catalog requests', async () => {
    const context = configureService();
    let resolveRequest: ((response: QueryResponse) => void) | undefined;
    context.setResponse(
      new Promise<QueryResponse>((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const firstRequest = context.service.getProducts();
    const secondRequest = context.service.getProducts();
    resolveRequest?.({ data: [PRODUCT], error: null });

    const [first, second] = await Promise.all([firstRequest, secondRequest]);
    expect(context.productQuery).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('marks the cache stale without querying until products are next requested', async () => {
    const context = configureService();
    await context.service.getProducts();

    context.service.invalidateProductsCache();
    expect(context.productQuery).toHaveBeenCalledTimes(1);

    await context.service.getProducts();
    expect(context.productQuery).toHaveBeenCalledTimes(2);
  });

  it('returns stale products and exposes the refresh error when a refresh fails', async () => {
    const context = configureService();
    const cached = await context.service.getProducts();
    context.service.invalidateProductsCache();
    context.setResponse(
      Promise.resolve({ data: null, error: { message: 'Temporary network failure' } }),
    );

    const fallback = await context.service.getProducts();

    expect(fallback).toEqual(cached);
    expect(context.service.refreshError()).toBe('Temporary network failure');
  });
});

function configureService(): CatalogTestContext {
  let response = Promise.resolve<QueryResponse>({ data: [PRODUCT], error: null });
  const productQuery = vi.fn(() => response);
  const select = vi.fn(() => ({ order: productQuery }));
  const from = vi.fn(() => ({ select }));

  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  channel.on.mockImplementation(() => channel);
  channel.subscribe.mockImplementation(() => channel);

  const supabase = {
    from,
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(() => Promise.resolve('ok')),
  } as unknown as SupabaseClient;

  TestBed.configureTestingModule({
    providers: [
      CustomerCatalogService,
      { provide: CUSTOMER_SUPABASE, useValue: supabase },
      {
        provide: CustomerReviewsService,
        useValue: { getPublishedReviewsByProduct: vi.fn(() => Promise.resolve([])) },
      },
    ],
  });

  return {
    service: TestBed.inject(CustomerCatalogService),
    productQuery,
    setResponse(nextResponse: Promise<QueryResponse>): void {
      response = nextResponse;
    },
  };
}
