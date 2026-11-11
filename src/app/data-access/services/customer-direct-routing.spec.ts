import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ADMIN_SUPABASE, CUSTOMER_SUPABASE } from '../../core/tokens';
import { CustomerAuthService } from '../../core/services/auth';
import { createClient } from '@supabase/supabase-js';
import { CategoriesService } from './categories.service';
import { PromotionsService } from './promotions.service';
import { DiscountsService } from './discounts.service';
import { CustomerCartService } from '../../features/customer/services/customer-cart.service';
import { CustomerWishlistService } from '../../features/customer/services/customer-wishlist.service';
import { CustomerOrdersService } from '../../features/customer/orders/customer-orders.service';

describe('shared storefront services select Customer/Public Supabase directly', () => {
  let requests: { url: URL; method: string }[];
  let adminSignedIn: boolean;
  let missingParent: boolean;
  let denyReads: boolean;

  beforeEach(() => {
    requests = []; adminSignedIn = false; missingParent = false; denyReads = false;
    vi.stubGlobal('BroadcastChannel', class {
      addEventListener(): void { /* No real tabs in this fixture. */ }
      postMessage(): void { /* No real tabs in this fixture. */ }
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input), 'https://nestora.test');
      requests.push({ url, method: options?.method ?? 'GET' });
      const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status, headers: { 'Content-Type': 'application/json' },
      });
      if (denyReads) {
        return respond({ code: 'SESSION_REQUIRED', message: 'Admin session required.' }, 401);
      }
      const table = url.pathname.split('/').at(-1);
      if (table === 'categories' && missingParent && url.searchParams.get('select')?.includes('parent_id')) {
        return respond({ code: '42703', message: 'column parent_id does not exist' }, 400);
      }
      const rows = table === 'categories' ? [{ id: 'category-fixture', name: 'Category', slug: 'category', is_active: true }]
        : table === 'products' ? [{ category_id: 'category-fixture' }]
        : table === 'promotions' ? [{ id: 'promotion-fixture', title: 'Promotion', is_active: true }]
        : table === 'discounts' ? [{ id: 'discount-fixture', name: 'Discount', code: 'CODE', is_active: true }]
        : [];
      return respond(new Headers(options?.headers).get('accept')?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
    }));
    TestBed.configureTestingModule({ providers: [
      { provide: ADMIN_SUPABASE, useValue: createClient('https://project.supabase.test', 'sb_publishable_test', {
        accessToken: async () => adminSignedIn ? 'admin-fixture-token' : null,
      }) },
      { provide: CUSTOMER_SUPABASE, useValue: createClient('https://project.supabase.test', 'sb_publishable_test', {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }) },
      { provide: CustomerAuthService, useValue: {
        getCurrentUserId: async () => 'customer-fixture',
        isAuthenticated: () => true,
        user: () => ({ id: 'customer-fixture' }),
      } },
    ] });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  for (const existingAdminSession of [false, true]) {
    it(`loads storefront reads without depending on Admin session = ${existingAdminSession}`, async () => {
      adminSignedIn = existingAdminSession;
      const categories = await TestBed.inject(CategoriesService).getPublicCategoriesWithProductCount();
      expect(categories[0]?.products_count).toBe(1);
      expect(await TestBed.inject(PromotionsService).getPublicPromotions()).toHaveLength(1);
      const discounts = TestBed.inject(DiscountsService);
      await discounts.getAutomaticFreeGiftDiscount();
      await discounts.getDiscountByCode('code');
      await discounts.getCustomerGiftProductsForDiscount('discount-fixture');
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.every(({ url }) => url.pathname.startsWith('/rest/v1/'))).toBe(true);
    });
  }

  it('keeps missing-parent fallback queries on the Customer client', async () => {
    missingParent = true;
    expect(await TestBed.inject(CategoriesService).getPublicCategories()).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect(requests.every(({ url }) => url.pathname.startsWith('/rest/v1/'))).toBe(true);
  });

  it('preserves Admin reads, category counts, writes and privileged discount RPCs', async () => {
    adminSignedIn = true;
    const categories = TestBed.inject(CategoriesService);
    await categories.getCategoriesWithProductCount();
    await categories.deleteCategory('category-fixture');
    const promotions = TestBed.inject(PromotionsService);
    await promotions.getPromotions(); await promotions.deletePromotion('promotion-fixture');
    const discounts = TestBed.inject(DiscountsService);
    await discounts.getDiscounts(); await discounts.getGiftProductsForDiscount('discount-fixture');
    await discounts.setGiftProductsForDiscount('discount-fixture', []);
    expect(requests.every(({ url }) => url.pathname.startsWith('/rest/v1/'))).toBe(true);
    expect(requests.some(({ method }) => method === 'DELETE')).toBe(true);
    expect(requests.some(({ url }) => url.pathname.endsWith('/rpc/replace_discount_gift_products'))).toBe(true);
  });

  it('never retries protected Admin reads as Customer/Public after an Admin 401', async () => {
    denyReads = true;
    await expect(TestBed.inject(CategoriesService).getCategories()).rejects.toThrow('Admin session required');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.pathname).toBe('/rest/v1/categories');
  });

  it('keeps cart, wishlist and orders on the Customer client', async () => {
    await TestBed.inject(CustomerCartService).loadLines('cart-fixture');
    await TestBed.inject(CustomerWishlistService).loadProductIds('customer-fixture');
    await TestBed.inject(CustomerOrdersService).getCustomerOrders();
    expect(requests).toHaveLength(3);
    expect(requests.every(({ url }) => url.pathname.startsWith('/rest/v1/'))).toBe(true);
    expect(requests.map(({ url }) => url.pathname.split('/').at(-1))).toEqual(['cart_items', 'wishlist', 'orders']);
  });
});
