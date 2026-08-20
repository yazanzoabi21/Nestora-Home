import { Injectable, inject } from '@angular/core';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { CustomerAuthService } from '../../../core/services/auth';
import { Product, ProductVariant } from '../../../data-access';
import { CustomerCartLine, CustomerProduct, GuestCartItem } from '../models';

interface CartRecord {
  id: string;
  user_id: string;
}
interface CartItemRecord {
  id: string;
  quantity: number;
  is_free_gift: boolean;
  applied_discount_id: string | null;
  discounts: { code: string } | { code: string }[] | null;
  products: Product | Product[] | null;
}

@Injectable({ providedIn: 'root' })
export class CustomerCartService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly auth = inject(CustomerAuthService);

  async getOrCreateCart(userId: string): Promise<string> {
    this.requireAuthenticatedCustomer(userId);
    const { data, error } = await this.supabase
      .from('carts')
      .select('id,user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error('Unable to load your cart.');
    if (data) return (data as CartRecord).id;
    const created = await this.supabase
      .from('carts')
      .insert({ user_id: userId })
      .select('id,user_id')
      .single();
    if (created.error) {
      const retry = await this.supabase.from('carts').select('id').eq('user_id', userId).single();
      if (retry.error) throw new Error('Unable to create your cart.');
      return retry.data.id as string;
    }
    return (created.data as CartRecord).id;
  }

  async loadLines(cartId: string): Promise<CustomerCartLine[]> {
    this.requireAuthenticatedCustomer();
    const { data, error } = await this.supabase
      .from('cart_items')
      .select('id,quantity,is_free_gift,applied_discount_id,discounts:applied_discount_id(code),products:product_id(*,categories(name))')
      .eq('cart_id', cartId)
      .order('created_at');
    if (error) throw new Error('Unable to load cart items.');
    return (data ?? []).flatMap((item) => {
      const record = item as unknown as CartItemRecord;
      const product = Array.isArray(record.products) ? record.products[0] : record.products;
      const discount = Array.isArray(record.discounts) ? record.discounts[0] : record.discounts;
      return product
        ? [{
            id: record.id,
            quantity: record.quantity,
            product: this.toCustomerProduct(product),
            isFreeGift: record.is_free_gift === true,
            appliedDiscountId: record.applied_discount_id,
            appliedDiscountCode: discount?.code ?? null,
          }]
        : [];
    });
  }

  async upsertItem(
    cartId: string,
    productId: string,
    quantity: number,
    cartItemId?: string,
    variantId: string | null = null,
  ): Promise<string> {
    this.requireAuthenticatedCustomer();
    void variantId;
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Cart quantity must be a positive integer.');
    }

    let itemId = cartItemId;
    if (!itemId) {
      const existingQuery = this.supabase
        .from('cart_items')
        .select('id')
        .eq('cart_id', cartId)
        .eq('product_id', productId)
        .eq('is_free_gift', false);
      const existing = await existingQuery.maybeSingle();
      if (existing.error) throw new Error('Unable to check your cart.');
      itemId = existing.data?.id as string | undefined;
    }

    if (itemId) {
      const { data, error } = await this.supabase
        .from('cart_items')
        .update({ quantity, is_free_gift: false, applied_discount_id: null })
        .eq('id', itemId)
        .eq('cart_id', cartId)
        .select('id')
        .single();
      if (error || !data) throw new Error('Unable to update your cart.');
      return data.id as string;
    }

    const { data, error } = await this.supabase
      .from('cart_items')
      .insert({ cart_id: cartId, product_id: productId, quantity, is_free_gift: false })
      .select('id')
      .single();
    if (error || !data) throw new Error('Unable to update your cart.');
    return data.id as string;
  }

  async replaceFreeGifts(
    cartId: string,
    discountId: string,
    productIds: readonly string[],
  ): Promise<readonly string[]> {
    this.requireAuthenticatedCustomer();
    const { data, error } = await this.supabase.rpc('replace_cart_free_gifts', {
      p_cart_id: cartId,
      p_discount_id: discountId,
      p_product_ids: [...new Set(productIds)],
    });
    if (error) throw new Error('Unable to save your free gift.');
    return Array.isArray(data) ? data.filter((id): id is string => typeof id === 'string') : [];
  }

  async removeItem(
    cartId: string,
    productId: string,
    variantId: string | null = null,
    isFreeGift = false,
    appliedDiscountId: string | null = null,
  ): Promise<void> {
    this.requireAuthenticatedCustomer();
    void variantId;
    let query = this.supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', cartId)
      .eq('product_id', productId)
      .eq('is_free_gift', isFreeGift);
    if (isFreeGift && appliedDiscountId) query = query.eq('applied_discount_id', appliedDiscountId);
    const { error } = await query;
    if (error) throw new Error('Unable to remove this item.');
  }

  async productsForGuest(items: readonly GuestCartItem[]): Promise<CustomerCartLine[]> {
    if (!items.length) return [];
    const { data, error } = await this.supabase
      .from('products')
      .select('*,categories(name)')
      .in(
        'id',
        items.map((item) => item.productId),
      );
    if (error) throw new Error('Unable to restore your cart.');
    return (data ?? [])
      .map((row) => {
        const product = row as Product;
        return items
          .filter((item) => item.productId === product.id)
          .map((stored) => {
            return {
              product: this.toCustomerProduct(product),
              quantity: stored.quantity,
              isFreeGift: stored.isFreeGift === true,
              appliedDiscountId: stored.appliedDiscountId ?? null,
              appliedDiscountCode: stored.appliedDiscountCode ?? null,
            };
          });
      })
      .flat()
      .filter((line) => line.quantity > 0);
  }

  async loadProducts(productIds: readonly string[]): Promise<CustomerProduct[]> {
    if (!productIds.length) return [];

    const { data, error } = await this.supabase
      .from('products')
      .select('*,categories(name)')
      .in('id', [...new Set(productIds)]);

    if (error) throw new Error('Unable to refresh product availability.');
    return (data ?? []).map((row) => this.toCustomerProduct(row as Product));
  }

  private requireAuthenticatedCustomer(expectedUserId?: string): string {
    const userId = this.auth.isAuthenticated() ? this.auth.user()?.id ?? null : null;

    if (!userId || (expectedUserId !== undefined && userId !== expectedUserId)) {
      throw new Error('An authenticated customer is required for the server cart.');
    }

    return userId;
  }

  private toCustomerProduct(product: Product, variant?: ProductVariant | null): CustomerProduct {
    const regular = Number(variant?.price ?? product.price ?? 0);
    const sale =
      variant?.sale_price === null || variant?.sale_price === undefined
        ? product.sale_price === null
          ? null
          : Number(product.sale_price)
        : Number(variant.sale_price);
    const price = sale !== null && sale < regular ? sale : regular;
    const relation = Array.isArray(product.categories) ? product.categories[0] : product.categories;
    const stock = Math.max(0, Number(variant?.stock ?? product.stock ?? 0));
    return {
      id: product.id,
      name: product.name,
      brand: 'Nestora',
      category: relation?.name || product.categoryName || 'Home',
      imageUrl: variant?.image_url || product.image_url || 'assets/images/product-placeholder.png',
      description: product.short_description || undefined,
      price,
      originalPrice: price < regular ? regular : null,
      rating: Number(product.rating ?? 0),
      reviewCount: 0,
      badge: product.is_new ? 'New' : null,
      isFeatured: product.is_featured === true,
      isNew: product.is_new === true,
      isActive: product.is_active !== false,
      isLoyaltyEligible: product.is_loyalty_eligible !== false,
      soldCount: Math.max(0, Number(product.sold_count ?? 0)),
      inStock: product.is_active !== false && stock > 0,
      stock,
      slug: product.slug,
      sku: variant?.sku ?? product.sku,
      variantId: variant?.id ?? null,
      variantLabel: variant ? variant.name || `${variant.option_name}: ${variant.option_value}` : null,
      variantOptionName: variant?.option_name ?? null,
      variantOptionValue: variant?.option_value ?? null,
      variantAttributes: variant?.attributes ?? {},
    };
  }
}
