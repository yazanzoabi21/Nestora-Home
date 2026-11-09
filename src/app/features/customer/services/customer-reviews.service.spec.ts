import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { AuthPersistenceStorage } from '../../../core/tokens/supabase.tokens';
import { createBffSupabaseClient } from '../../../core/services/bff/bff-supabase-client';
import { CustomerReviewsService } from './customer-reviews.service';

describe('guest review counts through the authorized public RPC', () => {
  let fetcher: ReturnType<typeof vi.fn>;
  let service: CustomerReviewsService;

  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    vi.stubGlobal('BroadcastChannel', undefined);
    fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      const csrf = path === '/api/csrf';
      return new Response(JSON.stringify(csrf ? { csrfToken: 'C'.repeat(43) }
        : [{ product_id: 'product-a' }, { product_id: 'product-a' }, { product_id: 'product-b' }]), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const client = createBffSupabaseClient('customer', 'https://project.supabase.test', 'sb_publishable_test',
      new AuthPersistenceStorage('nestora-customer-auth'));
    TestBed.configureTestingModule({ providers: [{ provide: CUSTOMER_SUPABASE, useValue: client }] });
    service = TestBed.inject(CustomerReviewsService);
  });

  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('batches product counts, caches zero counts, and never reads the protected table or auth endpoints', async () => {
    const counts = await service.getPublishedReviewCountsByProduct([' product-a ', 'product-a', 'product-b', 'product-c']);
    expect([...counts]).toEqual([['product-a', 2], ['product-b', 1], ['product-c', 0]]);
    const rpcCalls = fetcher.mock.calls.filter(([url]) => String(url).includes('/rpc/get_public_product_reviews'));
    expect(rpcCalls).toHaveLength(1);
    const [url, init] = rpcCalls[0] as [string, RequestInit];
    expect(new URL(url, 'https://nestora.test').searchParams.get('select')).toBe('product_id');
    expect(new URL(url, 'https://nestora.test').searchParams.get('product_id')).toContain('product-a');
    expect(JSON.parse(String(init.body))).toEqual({ p_product_id: null, p_limit: null });
    expect(new Headers(init.headers).has('x-csrf-token')).toBe(true);
    expect(new Headers(init.headers).has('authorization')).toBe(false);
    await service.getPublishedReviewCountsByProduct(['product-a', 'product-c']);
    expect(fetcher.mock.calls.filter(([path]) => String(path).includes('/rpc/'))).toHaveLength(1);
    expect(fetcher.mock.calls.some(([path]) => /\/reviews(?:\?|$)|\/auth\//.test(String(path)))).toBe(false);
  });

  it('does not cache failures as zero review counts', async () => {
    fetcher.mockImplementation(async () => { throw new Error('offline'); });
    await expect(service.getPublishedReviewCountsByProduct(['product-a'])).rejects.toThrow('Unable to load review counts');
    fetcher.mockResolvedValue(new Response(JSON.stringify([{ product_id: 'product-a' }]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    expect((await service.getPublishedReviewCountsByProduct(['product-a'])).get('product-a')).toBe(1);
  });
});
