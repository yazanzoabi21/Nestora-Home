import { Injectable, inject } from '@angular/core';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';

interface WishlistRecord {
  product_id: string;
}

interface SupabaseErrorDetails {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

@Injectable({ providedIn: 'root' })
export class CustomerWishlistService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);

  async loadProductIds(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('wishlist')
      .select('product_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      this.throwSupabaseError(error, 'Unable to load your wishlist.');
    }

    const records = (data as WishlistRecord[] | null) ?? [];
    return [...new Set(records.map((item) => item.product_id))];
  }

  async add(userId: string, productId: string, variantId: string | null = null): Promise<void> {
    void variantId;
    const { error } = await this.supabase
      .from('wishlist')
      .insert({ user_id: userId, product_id: productId });

    // A concurrent request may have inserted the same pair after the existence check.
    if (error && error.code !== '23505') {
      this.throwSupabaseError(error, 'Unable to save this product.');
    }
  }

  async remove(userId: string, productId: string): Promise<void> {
    const { error } = await this.supabase
      .from('wishlist')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);
    if (error) {
      this.throwSupabaseError(error, 'Unable to remove this product.');
    }
  }

  private throwSupabaseError(error: SupabaseErrorDetails, fallback: string): never {
    console.error('Wishlist Supabase error:', error);
    const context = [error.message, error.details, error.hint].filter(Boolean).join(' ');
    throw new Error(context || fallback);
  }
}
