import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth';
import { ToastService } from '../../../core/services';
import { CustomerCartLine, CustomerProduct, GuestCartItem } from '../models';
import { CustomerCartService } from './customer-cart.service';

const GUEST_CART_KEY = 'nestora_guest_cart_v1';

@Injectable({ providedIn: 'root' })
export class CustomerShoppingStateService {
  private readonly carts = inject(CustomerCartService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private cartId: string | null = null;
  readonly cart = signal<CustomerCartLine[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly pendingProductIds = signal<Set<string>>(new Set());
  readonly wishlistIds = signal<Set<string>>(new Set());
  readonly cartQuantity = computed(() => this.cart().reduce((sum, line) => sum + line.quantity, 0));
  readonly subtotal = computed(() =>
    this.cart().reduce((sum, line) => sum + line.product.price * line.quantity, 0),
  );

  constructor() {
    void this.initialize();
  }

  async initialize(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const userId = await this.auth.getCurrentUserId();
      const guestItems = this.readGuestItems();
      if (userId) {
        this.cartId = await this.carts.getOrCreateCart(userId);
        const serverLines = await this.carts.loadLines(this.cartId);
        const merged = new Map(serverLines.map((line) => [line.product.id, line]));
        if (guestItems.length) {
          for (const guest of await this.carts.productsForGuest(guestItems)) {
            const existing = merged.get(guest.product.id);
            const quantity = Math.min(
              guest.product.stock,
              (existing?.quantity ?? 0) + guest.quantity,
            );
            const id = await this.carts.upsertItem(
              this.cartId,
              guest.product.id,
              quantity,
              existing?.id,
            );
            merged.set(guest.product.id, { ...guest, id, quantity });
          }
          this.clearGuestItems();
        }
        this.cart.set([...merged.values()]);
      } else {
        this.cart.set(await this.carts.productsForGuest(guestItems));
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load your cart.');
    } finally {
      this.loading.set(false);
    }
  }

  async addToCart(product: CustomerProduct, requestedQuantity = 1): Promise<void> {
    if (!product.inStock || requestedQuantity < 1 || this.pendingProductIds().has(product.id))
      return;
    this.setPending(product.id, true);
    const existing = this.cart().find((line) => line.product.id === product.id);
    const quantity = Math.min(product.stock, (existing?.quantity ?? 0) + requestedQuantity);
    try {
      const id = this.cartId
        ? await this.carts.upsertItem(this.cartId, product.id, quantity, existing?.id)
        : existing?.id;
      this.cart.update((lines) =>
        existing
          ? lines.map((line) =>
              line.product.id === product.id ? { ...line, id: id ?? line.id, quantity } : line,
            )
          : [...lines, { id, product, quantity }],
      );
      this.persistGuest();
      this.toast.success('Added to cart', `${product.name} is now in your cart.`);
    } catch (error) {
      this.toast.failed('Adding to cart', error instanceof Error ? error.message : undefined);
    } finally {
      this.setPending(product.id, false);
    }
  }

  async setQuantity(productId: string, requested: number): Promise<void> {
    const line = this.cart().find((item) => item.product.id === productId);
    if (!line || this.pendingProductIds().has(productId)) return;
    const requestedQuantity = Number(requested);
    if (!Number.isInteger(requestedQuantity)) return;
    const quantity = Math.max(1, Math.min(line.product.stock, requestedQuantity));
    if (quantity === line.quantity) return;
    this.setPending(productId, true);
    try {
      const id = this.cartId
        ? await this.carts.upsertItem(this.cartId, productId, quantity, line.id)
        : line.id;
      this.cart.update((lines) =>
        lines.map((item) =>
          item.product.id === productId ? { ...item, id: id ?? item.id, quantity } : item,
        ),
      );
      this.persistGuest();
    } catch (error) {
      this.toast.failed('Updating cart', error instanceof Error ? error.message : undefined);
    } finally {
      this.setPending(productId, false);
    }
  }

  async removeFromCart(productId: string): Promise<void> {
    if (this.pendingProductIds().has(productId)) return;
    this.setPending(productId, true);
    try {
      if (this.cartId) await this.carts.removeItem(this.cartId, productId);
      this.cart.update((lines) => lines.filter((line) => line.product.id !== productId));
      this.persistGuest();
      this.toast.success('Item removed');
    } catch (error) {
      this.toast.failed('Removing item', error instanceof Error ? error.message : undefined);
    } finally {
      this.setPending(productId, false);
    }
  }

  toggleWishlist(productId: string): void {
    this.wishlistIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  clearCompletedCart(): void {
    this.cart.set([]);
    this.clearGuestItems();
  }

  private setPending(id: string, pending: boolean): void {
    this.pendingProductIds.update((current) => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  private persistGuest(): void {
    if (!this.cartId && typeof localStorage !== 'undefined')
      localStorage.setItem(
        GUEST_CART_KEY,
        JSON.stringify(
          this.cart().map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        ),
      );
  }
  private readGuestItems(): GuestCartItem[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const value: unknown = JSON.parse(localStorage.getItem(GUEST_CART_KEY) ?? '[]');
      return Array.isArray(value)
        ? value.filter(
            (item): item is GuestCartItem =>
              typeof item === 'object' &&
              item !== null &&
              typeof (item as GuestCartItem).productId === 'string' &&
              Number.isInteger((item as GuestCartItem).quantity),
          )
        : [];
    } catch {
      return [];
    }
  }
  private clearGuestItems(): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(GUEST_CART_KEY);
  }
}
