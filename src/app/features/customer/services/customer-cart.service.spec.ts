import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CustomerAuthService } from '../../../core/services/auth';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { Product, ProductVariant } from '../../../data-access';
import { CustomerCartService } from './customer-cart.service';

const VARIANT: ProductVariant = {
  id: 'variant-a', product_id: 'product-a', option_name: 'Size', option_value: 'Large',
  name: null, sku: null, price: 20, sale_price: null, stock: 3, attributes: {},
  media_id: null, image_url: null, is_active: true, sort_order: 0,
  created_at: null, updated_at: null,
};
const PRODUCT: Product = {
  id: 'product-a', category_id: null, name: 'Test product', slug: 'test-product',
  description: null, short_description: null, sku: null, image_url: null,
  gallery: null, features: [], price: 10, sale_price: null, cost_price: null,
  stock: 10, sold_count: 0, is_featured: false, is_new: false, is_active: true,
  is_loyalty_eligible: true, rating: 0, created_at: null, product_variants: [VARIANT],
};

describe('CustomerCartService variant persistence', () => {
  const query = vi.fn<() => Promise<{ data: unknown; error: null }>>();
  const insert = vi.fn();
  const eq = vi.fn();
  const is = vi.fn();
  let service: CustomerCartService;

  beforeEach(() => {
    query.mockReset().mockResolvedValue({ data: [PRODUCT], error: null });
    const builder = {
      select: vi.fn(), eq, is, in: vi.fn(), order: vi.fn(), insert,
      delete: vi.fn(), update: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      single: vi.fn(async () => ({ data: { id: 'cart-line' }, error: null })),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        query().then(resolve, reject),
    };
    for (const fn of [builder.select, eq, is, builder.in, builder.order, insert, builder.delete, builder.update]) {
      fn.mockReset().mockReturnValue(builder);
    }
    TestBed.configureTestingModule({ providers: [
      { provide: CUSTOMER_SUPABASE, useValue: { from: vi.fn(() => builder) } },
      { provide: CustomerAuthService, useValue: {
        isAuthenticated: () => true, user: () => ({ id: 'customer-a' }),
      } },
    ] });
    service = TestBed.inject(CustomerCartService);
  });

  it('stores and looks up the selected variant on server cart insertion', async () => {
    await service.upsertItem('cart-a', PRODUCT.id, 2, undefined, VARIANT.id);
    expect(eq).toHaveBeenCalledWith('variant_id', VARIANT.id);
    expect(insert).toHaveBeenCalledWith({
      cart_id: 'cart-a', product_id: PRODUCT.id, variant_id: VARIANT.id,
      quantity: 2, is_free_gift: false,
    });
  });

  it('restricts removal to the selected variant', async () => {
    await service.removeItem('cart-a', PRODUCT.id, VARIANT.id);
    expect(eq).toHaveBeenCalledWith('variant_id', VARIANT.id);
    await service.removeItem('cart-a', PRODUCT.id);
    expect(is).toHaveBeenCalledWith('variant_id', null);
  });

  it('restores guest variants with their own price and stock', async () => {
    const [line] = await service.productsForGuest([
      { productId: PRODUCT.id, variantId: VARIANT.id, quantity: 2 },
    ]);
    expect(line.product.variantId).toBe(VARIANT.id);
    expect(line.product.price).toBe(VARIANT.price);
    expect(line.product.stock).toBe(VARIANT.stock);
  });

  it('restores server variant lines without converting them to the base product', async () => {
    query.mockResolvedValue({ data: [{
      id: 'cart-line', variant_id: VARIANT.id, quantity: 2, products: PRODUCT,
      is_free_gift: false, applied_discount_id: null, discounts: null,
    }], error: null });
    const [line] = await service.loadLines('cart-a');
    expect(line.product.variantId).toBe(VARIANT.id);
    expect(line.product.price).toBe(VARIANT.price);
  });

  it('marks missing variants unavailable instead of substituting the base product', async () => {
    const [line] = await service.productsForGuest([
      { productId: PRODUCT.id, variantId: 'deleted-variant', quantity: 1 },
    ]);
    expect(line.product.variantId).toBe('deleted-variant');
    expect(line.product.inStock).toBe(false);
    expect(line.product.stock).toBe(0);
  });
});
