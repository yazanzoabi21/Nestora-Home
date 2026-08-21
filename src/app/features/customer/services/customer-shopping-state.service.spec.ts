import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';

import { ToastService } from '../../../core/services';
import { CustomerAuthService } from '../../../core/services/auth';
import { CustomerProduct } from '../models';
import { CustomerCartService } from './customer-cart.service';
import { CustomerCatalogService } from './customer-catalog.service';
import { CustomerShoppingStateService } from './customer-shopping-state.service';
import { CustomerWishlistService } from './customer-wishlist.service';

const PRODUCT: CustomerProduct = {
  id: 'product-1',
  name: 'Linen Cushion',
  brand: 'Nestora',
  category: 'Cushions',
  imageUrl: 'https://example.com/linen-cushion.webp',
  price: 35,
  rating: 4.5,
  reviewCount: 3,
  isFeatured: true,
  isNew: true,
  isActive: true,
  isLoyaltyEligible: true,
  soldCount: 5,
  inStock: true,
  stock: 8,
};

interface ShoppingTestContext {
  readonly service: CustomerShoppingStateService;
  readonly loadProductIds: ReturnType<typeof vi.fn>;
  readonly add: ReturnType<typeof vi.fn>;
  readonly remove: ReturnType<typeof vi.fn>;
  readonly getProducts: ReturnType<typeof vi.fn>;
  setUserId(userId: string | null): void;
}

describe('CustomerShoppingStateService wishlist synchronization', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('reuses one wishlist request for the same user and deduplicates concurrent calls', async () => {
    const context = configureShoppingState('user-a');

    await Promise.all([context.service.loadWishlist(), context.service.loadWishlist()]);
    await context.service.loadWishlist();

    expect(context.loadProductIds).toHaveBeenCalledTimes(1);
    expect(context.service.wishlistIds()).toEqual(new Set(['product-1']));
  });

  it('loads a different user and clears all wishlist state on logout', async () => {
    const context = configureShoppingState('user-a');
    await context.service.loadWishlist();

    context.setUserId('user-b');
    await context.service.loadWishlist();
    expect(context.loadProductIds).toHaveBeenCalledTimes(2);

    context.setUserId(null);
    await context.service.loadWishlist();
    expect(context.loadProductIds).toHaveBeenCalledTimes(2);
    expect(context.service.wishlistIds().size).toBe(0);
    expect(context.service.wishlistProducts()).toEqual([]);
  });

  it('loads only membership IDs globally and hydrates products lazily from the catalog', async () => {
    const context = configureShoppingState('user-a');

    await context.service.loadWishlist();
    expect(context.getProducts).not.toHaveBeenCalled();

    await Promise.all([
      context.service.ensureWishlistProducts(),
      context.service.ensureWishlistProducts(),
    ]);
    await context.service.ensureWishlistProducts();

    expect(context.getProducts).toHaveBeenCalledTimes(1);
    expect(context.service.wishlistProducts()).toEqual([PRODUCT]);
  });

  it('keeps add and remove optimistic without reloading membership or products', async () => {
    const context = configureShoppingState('user-a', []);

    await context.service.addToWishlist(PRODUCT);
    expect(context.service.wishlistIds().has(PRODUCT.id)).toBe(true);
    expect(context.add).toHaveBeenCalledTimes(1);

    await context.service.removeFromWishlist(PRODUCT.id);
    expect(context.service.wishlistIds().has(PRODUCT.id)).toBe(false);
    expect(context.remove).toHaveBeenCalledTimes(1);
    expect(context.loadProductIds).not.toHaveBeenCalled();
    expect(context.getProducts).not.toHaveBeenCalled();
  });
});

function configureShoppingState(
  initialUserId: string | null,
  wishlistIds: string[] = ['product-1'],
): ShoppingTestContext {
  const userId = signal<string | null>(initialUserId);
  const authLoading = signal(true);
  const authenticated = computed(() => userId() !== null);
  const loadProductIds = vi.fn(() => Promise.resolve([...wishlistIds]));
  const add = vi.fn(() => Promise.resolve());
  const remove = vi.fn(() => Promise.resolve());
  const getProducts = vi.fn(() => Promise.resolve([PRODUCT]));

  TestBed.configureTestingModule({
    providers: [
      CustomerShoppingStateService,
      {
        provide: CustomerAuthService,
        useValue: {
          isLoading: authLoading,
          isAuthenticated: authenticated,
          user: computed(() => {
            const id = userId();
            return id ? { id } : null;
          }),
          initialize: vi.fn(() => Promise.resolve()),
          getCurrentUserId: vi.fn(() => Promise.resolve(userId())),
        },
      },
      {
        provide: CustomerWishlistService,
        useValue: { loadProductIds, add, remove },
      },
      {
        provide: CustomerCatalogService,
        useValue: { getProducts },
      },
      {
        provide: CustomerCartService,
        useValue: {},
      },
      {
        provide: ToastService,
        useValue: {
          wishlist: vi.fn(),
          failed: vi.fn(),
          warn: vi.fn(),
          productAdded: vi.fn(),
        },
      },
      {
        provide: Router,
        useValue: { url: '/shop/products', navigate: vi.fn(() => Promise.resolve(true)) },
      },
      {
        provide: TranslateService,
        useValue: { instant: (key: string) => key },
      },
    ],
  });

  return {
    service: TestBed.inject(CustomerShoppingStateService),
    loadProductIds,
    add,
    remove,
    getProducts,
    setUserId(nextUserId: string | null): void {
      userId.set(nextUserId);
    },
  };
}
