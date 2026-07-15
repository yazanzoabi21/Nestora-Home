import { Injectable, computed, inject, signal } from '@angular/core';
import { CustomerAuthService } from '../../../core/services/auth';
import { ToastService } from '../../../core/services';
import { CustomerCartLine, CustomerProduct, GuestCartItem } from '../models';
import { CustomerCartService } from './customer-cart.service';

const GUEST_CART_KEY = 'nestora_guest_cart_v1';

@Injectable({ providedIn: 'root' })
export class CustomerShoppingStateService {
  private readonly carts = inject(CustomerCartService);
  private readonly auth = inject(CustomerAuthService);
  private readonly toast = inject(ToastService);
  private serverCartId: string | null = null;
  private isGuestCart = false;
  private readonly _checkoutCartId = signal<string | null>(null);
  readonly checkoutCartId = this._checkoutCartId.asReadonly();
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
        this.isGuestCart = false;
        this.serverCartId = await this.carts.getOrCreateCart(userId);
        this._checkoutCartId.set(this.serverCartId);
        const serverLines = await this.carts.loadLines(this.serverCartId);
        const merged = new Map(serverLines.map((line) => [line.product.id, line]));
        if (guestItems.length) {
          for (const guest of await this.carts.productsForGuest(guestItems)) {
            const existing = merged.get(guest.product.id);
            const quantity = Math.min(
              guest.product.stock,
              (existing?.quantity ?? 0) + guest.quantity,
            );
            const id = await this.carts.upsertItem(
              this.serverCartId,
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
        this.isGuestCart = true;
        this.serverCartId = null;
        this._checkoutCartId.set(null);
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
      const id = this.serverCartId
        ? await this.carts.upsertItem(this.serverCartId, product.id, quantity, existing?.id)
        : existing?.id;
      this.cart.update((lines) =>
        existing
          ? lines.map((line) =>
              line.product.id === product.id ? { ...line, id: id ?? line.id, quantity } : line,
            )
          : [...lines, { id, product, quantity }],
      );
      this.persistGuest();
      this.toast.productAdded(product.name, product.imageUrl);
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
      const id = this.serverCartId
        ? await this.carts.upsertItem(this.serverCartId, productId, quantity, line.id)
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
      if (this.serverCartId) await this.carts.removeItem(this.serverCartId, productId);
      this.cart.update((lines) => lines.filter((line) => line.product.id !== productId));
      this.persistGuest();
      // this.toast.success('Item removed');
    } catch (error) {
      this.toast.failed('Removing item', error instanceof Error ? error.message : undefined);
      throw error;
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

  async prepareCheckoutCart(): Promise<string | null> {
    if (!this.cart().length) throw new Error('Your cart is empty.');

    const userId = await this.auth.getCurrentUserId();
    const hasInvalidItems = this.cart().some(
      (line) => !line.product.id || !Number.isInteger(line.quantity) || line.quantity < 1,
    );
    if (hasInvalidItems) throw new Error('Your cart contains invalid items.');

    const cartId = userId ? await this.carts.getOrCreateCart(userId) : null;

    this.isGuestCart = !userId;
    this.serverCartId = cartId;
    this._checkoutCartId.set(cartId);
    return cartId;
  }

  clearCompletedCart(): void {
    this.cart.set([]);
    this.clearGuestItems();
    if (this.isGuestCart) {
      this.serverCartId = null;
      this._checkoutCartId.set(null);
    }
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
    if (this.isGuestCart && typeof window !== 'undefined')
      window.localStorage.setItem(
        GUEST_CART_KEY,
        JSON.stringify(
          this.cart().map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        ),
      );
  }
  private readGuestItems(): GuestCartItem[] {
    if (typeof window === 'undefined') return [];
    try {
      const value: unknown = JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) ?? '[]');
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
    if (typeof window !== 'undefined') window.localStorage.removeItem(GUEST_CART_KEY);
  }
}
