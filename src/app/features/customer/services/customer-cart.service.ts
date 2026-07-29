import { Injectable, inject } from '@angular/core';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { Product } from '../../../data-access';
import { CustomerCartLine, CustomerProduct, GuestCartItem } from '../models';

interface CartRecord {
  id: string;
  user_id: string;
}
interface CartItemRecord {
  id: string;
  quantity: number;
  products: Product | Product[] | null;
}

@Injectable({ providedIn: 'root' })
export class CustomerCartService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);

  async getOrCreateCart(userId: string): Promise<string> {
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
    const { data, error } = await this.supabase
      .from('cart_items')
      .select(`id,quantity,products:product_id(*,categories(name))`)
      .eq('cart_id', cartId)
      .order('created_at');
    if (error) throw new Error('Unable to load cart items.');
    return (data ?? []).flatMap((item) => {
      const record = item as unknown as CartItemRecord;
      const product = Array.isArray(record.products) ? record.products[0] : record.products;
      return product
        ? [{ id: record.id, quantity: record.quantity, product: this.toCustomerProduct(product) }]
        : [];
    });
  }

  async upsertItem(
    cartId: string,
    productId: string,
    quantity: number,
    cartItemId?: string,
  ): Promise<string> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Cart quantity must be a positive integer.');
    }

    let itemId = cartItemId;
    if (!itemId) {
      const existing = await this.supabase
        .from('cart_items')
        .select('id')
        .eq('cart_id', cartId)
        .eq('product_id', productId)
        .maybeSingle();
      if (existing.error) throw new Error('Unable to check your cart.');
      itemId = existing.data?.id as string | undefined;
    }

    if (itemId) {
      const { data, error } = await this.supabase
        .from('cart_items')
        .update({ quantity })
        .eq('id', itemId)
        .eq('cart_id', cartId)
        .select('id')
        .single();
      if (error || !data) throw new Error('Unable to update your cart.');
      return data.id as string;
    }

    const { data, error } = await this.supabase
      .from('cart_items')
      .upsert(
        { cart_id: cartId, product_id: productId, quantity },
        { onConflict: 'cart_id,product_id' },
      )
      .select('id')
      .single();
    if (error || !data) throw new Error('Unable to update your cart.');
    return data.id as string;
  }

  async removeItem(cartId: string, productId: string): Promise<void> {
    const { error } = await this.supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', cartId)
      .eq('product_id', productId);
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
        const stored = items.find((item) => item.productId === product.id)!;
        const mapped = this.toCustomerProduct(product);
        return { product: mapped, quantity: stored.quantity };
      })
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

  private toCustomerProduct(product: Product): CustomerProduct {
    const regular = Number(product.price ?? 0);
    const sale = product.sale_price === null ? null : Number(product.sale_price);
    const price = sale !== null && sale < regular ? sale : regular;
    const relation = Array.isArray(product.categories) ? product.categories[0] : product.categories;
    const stock = Math.max(0, Number(product.stock ?? 0));
    return {
      id: product.id,
      name: product.name,
      brand: 'Nestora',
      category: relation?.name || product.categoryName || 'Home',
      imageUrl: product.image_url || 'assets/images/product-placeholder.png',
      description: product.short_description || undefined,
      price,
      originalPrice: price < regular ? regular : null,
      rating: Number(product.rating ?? 0),
      reviewCount: 0,
      badge: product.is_new ? 'New' : null,
      isFeatured: product.is_featured === true,
      isNew: product.is_new === true,
      isActive: product.is_active !== false,
      soldCount: Math.max(0, Number(product.sold_count ?? 0)),
      inStock: product.is_active !== false && stock > 0,
      stock,
      slug: product.slug,
    };
  }
}
