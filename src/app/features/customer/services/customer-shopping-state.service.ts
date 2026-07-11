import { Injectable, signal } from '@angular/core';
import { CustomerProduct } from '../models';

export interface CustomerCartLine { product: CustomerProduct; quantity: number; }

@Injectable({ providedIn: 'root' })
export class CustomerShoppingStateService {
  readonly cart = signal<CustomerCartLine[]>([]);
  readonly wishlistIds = signal<Set<string>>(new Set());

  addToCart(product: CustomerProduct, quantity = 1): void {
    if (!product.inStock || quantity < 1) { return; }
    this.cart.update((lines) => {
      const existing = lines.find((line) => line.product.id === product.id);
      return existing
        ? lines.map((line) => line.product.id === product.id ? { ...line, quantity: Math.min(product.stock, line.quantity + quantity) } : line)
        : [...lines, { product, quantity: Math.min(product.stock, quantity) }];
    });
  }

  toggleWishlist(productId: string): void {
    this.wishlistIds.update((ids) => { const next = new Set(ids); if (next.has(productId)) { next.delete(productId); } else { next.add(productId); } return next; });
  }
}
