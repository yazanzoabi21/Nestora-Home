import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { CustomerAuthService } from '../../../core/services/auth';
import { ToastService } from '../../../core/services';
import { CustomerCartLine, CustomerProduct, GuestCartItem } from '../models';
import { CustomerCartService } from './customer-cart.service';
import { CustomerWishlistService } from './customer-wishlist.service';
import { CustomerCatalogService } from './customer-catalog.service';
import { Discount } from '../../../data-access';

const GUEST_CART_KEY = 'nestora_guest_cart_v1';

@Injectable({ providedIn: 'root' })
export class CustomerShoppingStateService {
  private readonly carts = inject(CustomerCartService);
  private readonly auth = inject(CustomerAuthService);
  private readonly toast = inject(ToastService);
  private readonly wishlistRepository = inject(CustomerWishlistService);
  private readonly catalog = inject(CustomerCatalogService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private serverCartId: string | null = null;
  private serverCartUserId: string | null = null;
  private isGuestCart = false;
  private cartLoadSequence = 0;
  private lastLoadedCartUserId: string | null | undefined;
  private activeCartLoad: { userId: string | null; promise: Promise<void> } | null = null;
  private lastLoadedWishlistUserId: string | null | undefined;
  private activeWishlistLoad: { userId: string | null; promise: Promise<void> } | null = null;
  private activeWishlistProductsLoad: {
    userId: string;
    revision: number;
    promise: Promise<void>;
  } | null = null;
  private wishlistProductIdsInOrder: string[] = [];
  private wishlistRevision = 0;
  private hydratedWishlistUserId: string | null = null;
  private hydratedWishlistRevision = -1;
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
  readonly paidCart = computed(() => this.cart().filter((line) => !line.isFreeGift));
  readonly freeGiftLines = computed(() => this.cart().filter((line) => line.isFreeGift));
  readonly subtotal = computed(() =>
    this.paidCart().reduce((sum, line) => sum + line.product.price * line.quantity, 0),
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

    const eligibleSubtotal = this.paidCart()
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
      const products = this.catalog.productsSnapshot();
      if (!products || this.wishlistProductIdsInOrder.length === 0) return;

      untracked(() => {
        const productsById = new Map(products.map((product) => [product.id, product]));
        this.wishlistProducts.set(
          this.wishlistProductIdsInOrder.flatMap((id) => {
            const product = productsById.get(id);
            return product ? [product] : [];
          }),
        );
      });
    });
    effect(() => {
      const authLoading = this.auth.isLoading();
      const userId = this.auth.isAuthenticated() ? this.auth.user()?.id ?? null : null;
      if (!authLoading) {
        void this.synchronizeCartForUser(userId);
        void this.synchronizeWishlistForUser(userId);
      }
    });
  }

  async initialize(): Promise<void> {
    await this.auth.initialize();
    const userId = this.auth.isAuthenticated() ? this.auth.user()?.id ?? null : null;
    await Promise.all([
      this.synchronizeCartForUser(userId, true),
      this.synchronizeWishlistForUser(userId),
    ]);
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
          this.lineKey(line.product.id, line.product.variantId),
          line,
        ]),
      );

      // Move existing guest cart items into the user's server cart.
      if (guestItems.length > 0) {
        const guestLines =
          await this.carts.productsForGuest(guestItems);

        for (const guest of guestLines) {
          const key = this.lineKey(guest.product.id, guest.product.variantId);
          const existing = merged.get(key);

          const quantity =
            (existing?.quantity ?? 0) +
            guest.quantity;

          const itemId =
            await this.carts.upsertItem(
              cartId,
              guest.product.id,
              quantity,
              existing?.id,
              guest.product.variantId,
            );

          merged.set(key, {
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
    const key = this.lineKey(product.id, product.variantId);
    const existing = this.cart().find(
      (line) => !line.isFreeGift && this.lineKey(line.product.id, line.product.variantId) === key,
    );
    const quantity = (existing?.quantity ?? 0) + requestedQuantity;
    if (!this.canUseQuantity(product, quantity)) {
      this.toast.warn('Stock unavailable', this.stockMessage(product, quantity));
      return;
    }
    this.setPending(product.id, true);
    try {
      const cartId = this.currentServerCartId();
      const id = cartId
        ? await this.carts.upsertItem(
            cartId,
            product.id,
            quantity,
            existing?.id,
            product.variantId,
          )
        : existing?.id;
      this.cart.update((lines) =>
        existing
          ? lines.map((line) =>
            this.lineKey(line.product.id, line.product.variantId) === key
              ? { ...line, id: id ?? line.id, quantity }
              : line,
          )
          : [...lines, {
              id,
              product,
              quantity,
              isFreeGift: false,
              appliedDiscountId: null,
              appliedDiscountCode: null,
            }],
      );
      this.persistGuest();
      this.toast.productAdded(product.name, product.imageUrl);
    } catch (error) {
      this.toast.failed('Adding to cart', error instanceof Error ? error.message : undefined);
    } finally {
      this.setPending(product.id, false);
    }
  }

  async setQuantity(
    productId: string,
    requested: number,
    variantId: string | null = null,
  ): Promise<void> {
    await this.ensureCurrentCartMode();
    const key = this.lineKey(productId, variantId);
    const line = this.cart().find(
      (item) => !item.isFreeGift && this.lineKey(item.product.id, item.product.variantId) === key,
    );
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
        ? await this.carts.upsertItem(cartId, productId, requestedQuantity, line.id, variantId)
        : line.id;
      this.cart.update((lines) =>
        lines.map((item) =>
          this.lineKey(item.product.id, item.product.variantId) === key
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

  async removeFromCart(
    productId: string,
    variantId: string | null = null,
    isFreeGift = false,
    appliedDiscountId: string | null = null,
  ): Promise<void> {
    await this.ensureCurrentCartMode();
    if (this.pendingProductIds().has(productId)) return;
    this.setPending(productId, true);
    try {
      const cartId = this.currentServerCartId();
      if (cartId) {
        await this.carts.removeItem(cartId, productId, variantId, isFreeGift, appliedDiscountId);
      }
      const key = this.lineKey(productId, variantId);
      this.cart.update((lines) =>
        lines.filter((line) => !(
          line.isFreeGift === isFreeGift &&
          line.appliedDiscountId === appliedDiscountId &&
          this.lineKey(line.product.id, line.product.variantId) === key
        )),
      );
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
    return this.paidCart()
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

  async selectFreeGift(discount: Discount, productId: string): Promise<void> {
    if (discount.discount_type !== 'free_gift') return;
    const product = (await this.carts.loadProducts([productId]))[0];
    if (!product?.isActive || !product.inStock) {
      throw new Error(this.translate.instant('CUSTOMER.FREE_GIFT.UNAVAILABLE'));
    }

    const current = this.freeGiftLines().filter(
      (line) => line.appliedDiscountId === discount.id,
    );
    const alreadySelected = current.some((line) => line.product.id === productId);
    const nextProducts = alreadySelected
      ? current.filter((line) => line.product.id !== productId).map((line) => line.product)
      : discount.gift_quantity === 1
        ? [product]
        : [...current.map((line) => line.product), product].slice(-discount.gift_quantity);

    const cartId = this.currentServerCartId();
    const itemIds = cartId
      ? await this.carts.replaceFreeGifts(cartId, discount.id, nextProducts.map((item) => item.id))
      : [];
    this.cart.update((lines) => [
      ...lines.filter((line) => !(line.isFreeGift && line.appliedDiscountId === discount.id)),
      ...nextProducts.map((item, index) => ({
        id: itemIds[index],
        product: item,
        quantity: 1,
        isFreeGift: true,
        appliedDiscountId: discount.id,
        appliedDiscountCode: discount.code,
      })),
    ]);
    this.persistGuest();
  }

  async clearFreeGiftSelection(discountId: string): Promise<void> {
    const cartId = this.currentServerCartId();
    if (cartId) await this.carts.replaceFreeGifts(cartId, discountId, []);
    this.cart.update((lines) =>
      lines.filter((line) => !(line.isFreeGift && line.appliedDiscountId === discountId)),
    );
    this.persistGuest();
  }

  isInWishlist(productId: string): boolean {
    return this.wishlistIds().has(productId);
  }

  async loadWishlist(): Promise<void> {
    await this.synchronizeWishlistForUser(await this.auth.getCurrentUserId());
  }

  async refreshWishlist(): Promise<void> {
    await this.synchronizeWishlistForUser(await this.auth.getCurrentUserId(), true);
  }

  async ensureWishlistProducts(): Promise<void> {
    const userId = await this.auth.getCurrentUserId();
    await this.synchronizeWishlistForUser(userId);

    if (!userId || this.wishlistProductIdsInOrder.length === 0) {
      this.wishlistProducts.set([]);
      return;
    }

    const revision = this.wishlistRevision;
    if (
      this.hydratedWishlistUserId === userId &&
      this.hydratedWishlistRevision === revision
    ) {
      return;
    }

    if (
      this.activeWishlistProductsLoad?.userId === userId &&
      this.activeWishlistProductsLoad.revision === revision
    ) {
      await this.activeWishlistProductsLoad.promise;
      return;
    }

    const promise = this.loadWishlistProductsFromCatalog(userId, revision);
    this.activeWishlistProductsLoad = { userId, revision, promise };

    try {
      await promise;
    } finally {
      if (this.activeWishlistProductsLoad?.promise === promise) {
        this.activeWishlistProductsLoad = null;
      }
    }
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
    const productsWereHydrated = this.hasHydratedWishlistProducts(userId);
    this.wishlistIds.update((ids) => new Set(ids).add(product.id));
    this.wishlistProductIdsInOrder = [
      product.id,
      ...this.wishlistProductIdsInOrder.filter((id) => id !== product.id),
    ];
    this.wishlistProducts.update((products) => [product, ...products.filter((item) => item.id !== product.id)]);
    this.advanceWishlistRevision(userId, productsWereHydrated);
    try {
      await this.wishlistRepository.add(userId, product.id, product.variantId);
      this.toast.wishlist(this.translate.instant('CUSTOMER.WISHLIST.SAVED'));
    } catch (error) {
      this.wishlistIds.update((ids) => {
        const next = new Set(ids);
        next.delete(product.id);
        return next;
      });
      this.wishlistProducts.update((products) => products.filter((item) => item.id !== product.id));
      this.wishlistProductIdsInOrder = this.wishlistProductIdsInOrder.filter(
        (id) => id !== product.id,
      );
      this.advanceWishlistRevision(userId, productsWereHydrated);
      this.showWishlistError(error);
    } finally {
      this.setWishlistPending(product.id, false);
    }
  }

  async removeFromWishlist(productId: string): Promise<void> {
    const userId = this.auth.isAuthenticated() ? this.auth.user()?.id ?? null : null;
    if (!userId || !this.isInWishlist(productId) || this.wishlistPendingProductIds().has(productId)) return;
    const previousProducts = this.wishlistProducts();
    const previousProductIdsInOrder = this.wishlistProductIdsInOrder;
    const productsWereHydrated = this.hasHydratedWishlistProducts(userId);
    this.setWishlistPending(productId, true);
    this.wishlistIds.update((ids) => {
      const next = new Set(ids);
      next.delete(productId);
      return next;
    });
    this.wishlistProducts.update((products) => products.filter((item) => item.id !== productId));
    this.wishlistProductIdsInOrder = this.wishlistProductIdsInOrder.filter(
      (id) => id !== productId,
    );
    this.advanceWishlistRevision(userId, productsWereHydrated);
    try {
      await this.wishlistRepository.remove(userId, productId);
      this.toast.wishlist(this.translate.instant('CUSTOMER.WISHLIST.REMOVED'));
    } catch (error) {
      this.wishlistIds.update((ids) => new Set(ids).add(productId));
      this.wishlistProducts.set(previousProducts);
      this.wishlistProductIdsInOrder = previousProductIdsInOrder;
      this.advanceWishlistRevision(userId, productsWereHydrated);
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

  quantityFor(productId: string, variantId: string | null = null): number {
    const key = this.lineKey(productId, variantId);
    return (
      this.cart().find(
        (line) => !line.isFreeGift && this.lineKey(line.product.id, line.product.variantId) === key,
      )?.quantity ?? 0
    );
  }

  remainingStock(product: CustomerProduct): number {
    return Math.max(0, product.stock - this.quantityFor(product.id, product.variantId));
  }

  canAdd(product: CustomerProduct, requestedQuantity = 1): boolean {
    return this.canUseQuantity(
      product,
      this.quantityFor(product.id, product.variantId) + requestedQuantity,
    );
  }

  private async refreshCartStock(): Promise<void> {
    const currentLines = this.cart();
    const refreshedLines = await this.carts.productsForGuest(
      currentLines.map((line) => ({
        productId: line.product.id,
        variantId: line.product.variantId,
        quantity: line.quantity,
        isFreeGift: line.isFreeGift,
        appliedDiscountId: line.appliedDiscountId,
        appliedDiscountCode: line.appliedDiscountCode,
      })),
    );
    const latestByKey = new Map(
      refreshedLines.map((line) => [
        this.lineKey(line.product.id, line.product.variantId),
        line.product,
      ]),
    );

    this.cart.set(
      currentLines.map((line) => ({
        ...line,
        product:
          latestByKey.get(this.lineKey(line.product.id, line.product.variantId)) ?? {
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

  private async synchronizeWishlistForUser(
    userId: string | null,
    force = false,
  ): Promise<void> {
    if (this.activeWishlistLoad?.userId === userId) {
      await this.activeWishlistLoad.promise;
      return;
    }

    if (!force && this.lastLoadedWishlistUserId === userId) return;

    const promise = this.loadWishlistForUser(userId);
    this.activeWishlistLoad = { userId, promise };

    try {
      await promise;
    } finally {
      if (this.activeWishlistLoad?.promise === promise) {
        this.activeWishlistLoad = null;
      }
    }
  }

  private async loadWishlistForUser(userId: string | null): Promise<void> {
    const sequence = ++this.wishlistLoadSequence;

    this.wishlistLoading.set(true);
    this.wishlistError.set(null);
    this.wishlistPendingProductIds.set(new Set());

    if (!userId) {
      this.clearWishlistState();
      this.lastLoadedWishlistUserId = null;
      this.wishlistLoading.set(false);
      return;
    }

    if (this.lastLoadedWishlistUserId !== userId) {
      this.clearWishlistState();
    }

    try {
      const productIds = await this.wishlistRepository.loadProductIds(userId);

      if (sequence !== this.wishlistLoadSequence) return;

      this.wishlistProductIdsInOrder = productIds;
      this.wishlistIds.set(new Set(productIds));
      this.wishlistProducts.update((products) => {
        const productsById = new Map(products.map((product) => [product.id, product]));
        return productIds.flatMap((id) => {
          const product = productsById.get(id);
          return product ? [product] : [];
        });
      });
      this.wishlistRevision += 1;
      this.hydratedWishlistUserId = null;
      this.hydratedWishlistRevision = -1;
      this.lastLoadedWishlistUserId = userId;
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

  private async loadWishlistProductsFromCatalog(
    userId: string,
    revision: number,
  ): Promise<void> {
    this.wishlistLoading.set(true);
    this.wishlistError.set(null);

    try {
      const products = await this.catalog.getProducts();
      if (
        this.lastLoadedWishlistUserId !== userId ||
        this.wishlistRevision !== revision
      ) {
        return;
      }

      const productsById = new Map(products.map((product) => [product.id, product]));
      this.wishlistProducts.set(
        this.wishlistProductIdsInOrder.flatMap((id) => {
          const product = productsById.get(id);
          return product ? [product] : [];
        }),
      );
      this.hydratedWishlistUserId = userId;
      this.hydratedWishlistRevision = revision;
    } catch (error) {
      this.wishlistError.set(
        error instanceof Error ? error.message : 'Unable to load your wishlist.',
      );
      this.showWishlistError(error);
    } finally {
      if (this.lastLoadedWishlistUserId === userId) {
        this.wishlistLoading.set(false);
      }
    }
  }

  private clearWishlistState(): void {
    this.wishlistProducts.set([]);
    this.wishlistIds.set(new Set());
    this.wishlistProductIdsInOrder = [];
    this.wishlistRevision += 1;
    this.hydratedWishlistUserId = null;
    this.hydratedWishlistRevision = -1;
  }

  private hasHydratedWishlistProducts(userId: string): boolean {
    return (
      this.hydratedWishlistUserId === userId &&
      this.hydratedWishlistRevision === this.wishlistRevision
    );
  }

  private advanceWishlistRevision(userId: string, productsRemainHydrated: boolean): void {
    this.wishlistRevision += 1;
    if (productsRemainHydrated) {
      this.hydratedWishlistUserId = userId;
      this.hydratedWishlistRevision = this.wishlistRevision;
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

  lineKey(productId: string, variantId?: string | null): string {
    return `${productId}:${variantId ?? 'base'}`;
  }
  cartLineKey(line: CustomerCartLine): string {
    return `${this.lineKey(line.product.id, line.product.variantId)}:${line.isFreeGift ? line.appliedDiscountId : 'paid'}`;
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
          this.cart().map((line) => ({
            productId: line.product.id,
            variantId: line.product.variantId ?? null,
            quantity: line.quantity,
            isFreeGift: line.isFreeGift,
            appliedDiscountId: line.appliedDiscountId,
            appliedDiscountCode: line.appliedDiscountCode,
          })),
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
            ((item as GuestCartItem).variantId === undefined ||
              (item as GuestCartItem).variantId === null ||
              typeof (item as GuestCartItem).variantId === 'string') &&
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
