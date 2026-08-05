import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { CustomerAuthService } from '../../../core/services/auth';
import { ToastService } from '../../../core/services';
import { CustomerCartLine, CustomerProduct, GuestCartItem } from '../models';
import { CustomerCartService } from './customer-cart.service';
import { CustomerWishlistService } from './customer-wishlist.service';
import { Discount } from '../../../data-access';

const GUEST_CART_KEY = 'nestora_guest_cart_v1';

@Injectable({ providedIn: 'root' })
export class CustomerShoppingStateService {
  private readonly carts = inject(CustomerCartService);
  private readonly auth = inject(CustomerAuthService);
  private readonly toast = inject(ToastService);
  private readonly wishlistRepository = inject(CustomerWishlistService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private serverCartId: string | null = null;
  private serverCartUserId: string | null = null;
  private isGuestCart = false;
  private cartLoadSequence = 0;
  private lastLoadedCartUserId: string | null | undefined;
  private activeCartLoad: { userId: string | null; promise: Promise<void> } | null = null;
  private readonly _checkoutCartId = signal<string | null>(null);
  readonly checkoutCartId = this._checkoutCartId.asReadonly();
  readonly cart = signal<CustomerCartLine[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly pendingProductIds = signal<Set<string>>(new Set());
  readonly wishlistIds = signal<Set<string>>(new Set());
  readonly wishlistProducts = signal<CustomerProduct[]>([]);
  readonly wishlistLoading = signal(true);
  readonly wishlistError = signal<string | null>(null);
  readonly wishlistPendingProductIds = signal<Set<string>>(new Set());
  readonly wishlistCount = computed(() => this.wishlistIds().size);
  readonly cartQuantity = computed(() => this.cart().reduce((sum, line) => sum + line.quantity, 0));
  readonly subtotal = computed(() =>
    this.cart().reduce((sum, line) => sum + line.product.price * line.quantity, 0),
  );
  readonly stockConflicts = computed(() =>
    this.cart().filter(
      (line) =>
        !line.product.inStock ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > line.product.stock,
    ),
  );

  private readonly _appliedDiscount = signal<Discount | null>(null);

  readonly appliedDiscount = this._appliedDiscount.asReadonly();

  readonly discountAmount = computed(() => {
    const discount = this._appliedDiscount();

    if (!discount) {
      return 0;
    }

    const eligibleSubtotal = this.cart()
      .filter((line) => {
        if (discount.applies_to === 'all') {
          return true;
        }

        if (discount.applies_to === 'product') {
          return discount.product_id === line.product.id;
        }

        if (discount.applies_to === 'category') {
          return line.product.category === discount.categories?.name;
        }

        return false;
      })
      .reduce((total, line) => total + line.product.price * line.quantity, 0);

    if (eligibleSubtotal <= 0) {
      return 0;
    }

    if (discount.discount_type === 'percentage') {
      const percentage = Math.min(100, Math.max(0, discount.discount_value ?? 0));

      return (eligibleSubtotal * percentage) / 100;
    }

    if (discount.discount_type === 'fixed_amount') {
      return Math.min(eligibleSubtotal, Math.max(0, discount.discount_value ?? 0));
    }

    return 0;
  });

  constructor() {
    effect(() => {
      const authLoading = this.auth.isLoading();
      const userId = this.auth.isAuthenticated() ? this.auth.user()?.id ?? null : null;
      if (!authLoading) {
        void this.synchronizeCartForUser(userId);
        void this.loadWishlistForUser(userId);
      }
    });
  }

  async initialize(): Promise<void> {
    await this.auth.initialize();
    const userId = this.auth.isAuthenticated() ? this.auth.user()?.id ?? null : null;
    await this.synchronizeCartForUser(userId, true);
  }

  private async synchronizeCartForUser(userId: string | null, force = false): Promise<void> {
    if (this.activeCartLoad?.userId === userId) {
      await this.activeCartLoad.promise;
      return;
    }

    if (!force && this.lastLoadedCartUserId === userId) return;

    const promise = this.loadCartForUser(userId);
    this.activeCartLoad = { userId, promise };

    try {
      await promise;
    } finally {
      if (this.activeCartLoad?.promise === promise) this.activeCartLoad = null;
    }
  }

  private async loadCartForUser(userId: string | null): Promise<void> {
    const sequence = ++this.cartLoadSequence;
    this.loading.set(true);
    this.error.set(null);

    try {
      const guestItems = this.readGuestItems();

      // Guest customer: use localStorage only.
      if (!userId) {
        this.isGuestCart = true;
        this.serverCartId = null;
        this.serverCartUserId = null;
        this._checkoutCartId.set(null);

        const guestLines =
          await this.carts.productsForGuest(guestItems);

        if (sequence !== this.cartLoadSequence) return;
        this.cart.set(guestLines);
        this.lastLoadedCartUserId = null;
        return;
      }

      // Logged-in customer: use Supabase cart.
      this.isGuestCart = false;
      this.serverCartUserId = userId;

      const cartId =
        await this.carts.getOrCreateCart(userId);

      this.serverCartId = cartId;
      this._checkoutCartId.set(cartId);

      const serverLines =
        await this.carts.loadLines(cartId);

      if (sequence !== this.cartLoadSequence) return;

      const merged = new Map(
        serverLines.map((line) => [
          line.product.id,
          line,
        ]),
      );

      // Move existing guest cart items into the user's server cart.
      if (guestItems.length > 0) {
        const guestLines =
          await this.carts.productsForGuest(guestItems);

        for (const guest of guestLines) {
          const existing =
            merged.get(guest.product.id);

          const quantity =
            (existing?.quantity ?? 0) +
            guest.quantity;

          const itemId =
            await this.carts.upsertItem(
              cartId,
              guest.product.id,
              quantity,
              existing?.id,
            );

          merged.set(guest.product.id, {
            ...guest,
            id: itemId,
            quantity,
          });
        }

        if (sequence !== this.cartLoadSequence) return;
        this.clearGuestItems();
      }

      this.cart.set([...merged.values()]);
      this.lastLoadedCartUserId = userId;
    } catch (error) {
      if (sequence !== this.cartLoadSequence) return;
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to load your cart.';

      this.error.set(message);
    } finally {
      if (sequence === this.cartLoadSequence) this.loading.set(false);
    }
  }

  async addToCart(product: CustomerProduct, requestedQuantity = 1): Promise<void> {
    if (this.pendingProductIds().has(product.id)) return;
    await this.ensureCurrentCartMode();
    const existing = this.cart().find((line) => line.product.id === product.id);
    const quantity = (existing?.quantity ?? 0) + requestedQuantity;
    if (!this.canUseQuantity(product, quantity)) {
      this.toast.warn('Stock unavailable', this.stockMessage(product, quantity));
      return;
    }
    this.setPending(product.id, true);
    try {
      const cartId = this.currentServerCartId();
      const id = cartId
        ? await this.carts.upsertItem(cartId, product.id, quantity, existing?.id)
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
    await this.ensureCurrentCartMode();
    const line = this.cart().find((item) => item.product.id === productId);
    if (!line || this.pendingProductIds().has(productId)) return;
    const requestedQuantity = Number(requested);
    if (!Number.isInteger(requestedQuantity)) return;
    if (!this.canUseQuantity(line.product, requestedQuantity)) {
      this.toast.warn('Stock unavailable', this.stockMessage(line.product, requestedQuantity));
      return;
    }
    if (requestedQuantity === line.quantity) return;
    this.setPending(productId, true);
    try {
      const cartId = this.currentServerCartId();
      const id = cartId
        ? await this.carts.upsertItem(cartId, productId, requestedQuantity, line.id)
        : line.id;
      this.cart.update((lines) =>
        lines.map((item) =>
          item.product.id === productId
            ? { ...item, id: id ?? item.id, quantity: requestedQuantity }
            : item,
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
    await this.ensureCurrentCartMode();
    if (this.pendingProductIds().has(productId)) return;
    this.setPending(productId, true);
    try {
      const cartId = this.currentServerCartId();
      if (cartId) await this.carts.removeItem(cartId, productId);
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

  getEligibleSubtotal(discount: Discount): number {
    return this.cart()
      .filter((line) => {
        if (discount.applies_to === 'all') {
          return true;
        }

        if (discount.applies_to === 'product') {
          return discount.product_id === line.product.id;
        }

        if (discount.applies_to === 'category') {
          return line.product.category === discount.categories?.name;
        }

        return false;
      })
      .reduce((total, line) => total + line.product.price * line.quantity, 0);
  }

  setAppliedDiscount(discount: Discount): void {
    this._appliedDiscount.set(discount);
  }

  clearAppliedDiscount(): void {
    this._appliedDiscount.set(null);
  }

  isInWishlist(productId: string): boolean {
    return this.wishlistIds().has(productId);
  }

  async loadWishlist(): Promise<void> {
    await this.loadWishlistForUser(await this.auth.getCurrentUserId());
  }

  async toggleWishlist(product: CustomerProduct): Promise<void> {
    if (this.wishlistPendingProductIds().has(product.id)) return;
    const userId = this.auth.isAuthenticated() ? this.auth.user()?.id ?? null : null;
    if (!userId) {
      await this.router.navigate(['/auth/customer-login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }
    if (this.isInWishlist(product.id)) await this.removeFromWishlist(product.id);
    else await this.addToWishlist(product);
  }

  async addToWishlist(product: CustomerProduct): Promise<void> {
    const userId = this.auth.isAuthenticated() ? this.auth.user()?.id ?? null : null;
    if (!userId || this.isInWishlist(product.id) || this.wishlistPendingProductIds().has(product.id)) return;
    this.setWishlistPending(product.id, true);
    this.wishlistIds.update((ids) => new Set(ids).add(product.id));
    this.wishlistProducts.update((products) => [product, ...products.filter((item) => item.id !== product.id)]);
    try {
      await this.wishlistRepository.add(userId, product.id);
      this.toast.wishlist(this.translate.instant('CUSTOMER.WISHLIST.SAVED'));
    } catch (error) {
      this.wishlistIds.update((ids) => {
        const next = new Set(ids);
        next.delete(product.id);
        return next;
      });
      this.wishlistProducts.update((products) => products.filter((item) => item.id !== product.id));
      this.showWishlistError(error);
    } finally {
      this.setWishlistPending(product.id, false);
    }
  }

  async removeFromWishlist(productId: string): Promise<void> {
    const userId = this.auth.isAuthenticated() ? this.auth.user()?.id ?? null : null;
    if (!userId || !this.isInWishlist(productId) || this.wishlistPendingProductIds().has(productId)) return;
    const previousProducts = this.wishlistProducts();
    this.setWishlistPending(productId, true);
    this.wishlistIds.update((ids) => {
      const next = new Set(ids);
      next.delete(productId);
      return next;
    });
    this.wishlistProducts.update((products) => products.filter((item) => item.id !== productId));
    try {
      await this.wishlistRepository.remove(userId, productId);
      this.toast.wishlist(this.translate.instant('CUSTOMER.WISHLIST.REMOVED'));
    } catch (error) {
      this.wishlistIds.update((ids) => new Set(ids).add(productId));
      this.wishlistProducts.set(previousProducts);
      this.showWishlistError(error);
    } finally {
      this.setWishlistPending(productId, false);
    }
  }

  async prepareCheckoutCart(): Promise<string | null> {
    if (!this.cart().length) throw new Error('Your cart is empty.');

    await this.refreshCartStock();

    const userId = await this.auth.getCurrentUserId();
    const hasInvalidItems = this.cart().some(
      (line) => !line.product.id || !this.canUseQuantity(line.product, line.quantity),
    );
    if (hasInvalidItems) {
      const conflict = this.stockConflicts()[0];
      throw new Error(
        conflict
          ? this.stockMessage(conflict.product, conflict.quantity)
          : 'Your cart contains invalid items.',
      );
    }

    const cartId = userId ? await this.carts.getOrCreateCart(userId) : null;

    this.isGuestCart = !userId;
    this.serverCartId = cartId;
    this._checkoutCartId.set(cartId);
    return cartId;
  }

  clearCompletedCart(): void {
    this.cart.set([]);
    this.clearAppliedDiscount();
    this.clearGuestItems();

    if (this.isGuestCart) {
      this.serverCartId = null;
      this._checkoutCartId.set(null);
    }
  }

  quantityFor(productId: string): number {
    return this.cart().find((line) => line.product.id === productId)?.quantity ?? 0;
  }

  remainingStock(product: CustomerProduct): number {
    return Math.max(0, product.stock - this.quantityFor(product.id));
  }

  canAdd(product: CustomerProduct, requestedQuantity = 1): boolean {
    return this.canUseQuantity(product, this.quantityFor(product.id) + requestedQuantity);
  }

  private async refreshCartStock(): Promise<void> {
    const currentLines = this.cart();
    const products = await this.carts.loadProducts(currentLines.map((line) => line.product.id));
    const latestById = new Map(products.map((product) => [product.id, product]));

    this.cart.set(
      currentLines.map((line) => ({
        ...line,
        product: latestById.get(line.product.id) ?? {
          ...line.product,
          inStock: false,
          stock: 0,
        },
      })),
    );
    this.persistGuest();
  }

  private canUseQuantity(product: CustomerProduct, quantity: number): boolean {
    return (
      product.inStock && Number.isInteger(quantity) && quantity >= 1 && quantity <= product.stock
    );
  }

  private stockMessage(product: CustomerProduct, requestedQuantity: number): string {
    if (!product.inStock || product.stock <= 0) {
      return `${product.name} is currently out of stock.`;
    }

    return `Only ${product.stock} ${product.stock === 1 ? 'unit is' : 'units are'} available for ${product.name}; ${requestedQuantity} requested.`;
  }

  private setPending(id: string, pending: boolean): void {
    this.pendingProductIds.update((current) => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private wishlistLoadSequence = 0;

  private async loadWishlistForUser(userId: string | null): Promise<void> {
    const sequence = ++this.wishlistLoadSequence;

    this.wishlistLoading.set(true); // Set this FIRST
    this.wishlistError.set(null);
    this.wishlistPendingProductIds.set(new Set());

    if (!userId) {
      this.wishlistProducts.set([]);
      this.wishlistIds.set(new Set());
      this.wishlistLoading.set(false);
      return;
    }

    try {
      const products = await this.wishlistRepository.load(userId);

      if (sequence !== this.wishlistLoadSequence) return;

      this.wishlistProducts.set(products);
      this.wishlistIds.set(new Set(products.map((product) => product.id)));
    } catch (error) {
      if (sequence !== this.wishlistLoadSequence) return;

      this.wishlistError.set(
        error instanceof Error ? error.message : 'Unable to load your wishlist.',
      );
      this.showWishlistError(error);
    } finally {
      if (sequence === this.wishlistLoadSequence) {
        this.wishlistLoading.set(false);
      }
    }
  }

  private setWishlistPending(id: string, pending: boolean): void {
    this.wishlistPendingProductIds.update((current) => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private showWishlistError(error: unknown): void {
    console.error('Wishlist request failed', error);
    this.toast.failed(this.translate.instant('CUSTOMER.WISHLIST.UPDATE_FAILED'));
  }
  private async ensureCurrentCartMode(): Promise<void> {
    const userId = this.auth.isAuthenticated() ? this.auth.user()?.id ?? null : null;
    await this.synchronizeCartForUser(userId);
  }
  private currentServerCartId(): string | null {
    const userId = this.auth.isAuthenticated() ? this.auth.user()?.id ?? null : null;
    return userId && userId === this.serverCartUserId ? this.serverCartId : null;
  }
  private persistGuest(): void {
    if (!this.auth.isAuthenticated() && typeof window !== 'undefined')
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
