import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ToastService } from '../../../core/services';
import { CustomerAuthService } from '../../../core/services/auth';
import { Discount, DiscountGiftProduct, DiscountsService } from '../../../data-access';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import { CustomerLoyaltyPointsBadgeComponent } from '../../../shared/components/customer-loyalty-points-badge';
import { CustomerCartLine } from '../models';
import { CustomerShoppingStateService, LoyaltyPointsCalculatorService } from '../services';
import { CustomerFreeGiftSelectorComponent } from '../components/customer-free-gift-selector';

@Component({
  selector: 'app-customer-cart',
  standalone: true,
  imports: [AdminFormModalComponent, CurrencyPipe, CustomerFreeGiftSelectorComponent, CustomerLoyaltyPointsBadgeComponent, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './customer-cart.component.html',
  styleUrl: './customer-cart.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerCartComponent implements OnInit {
  readonly shopping = inject(CustomerShoppingStateService);
  readonly loyalty = inject(LoyaltyPointsCalculatorService);
  readonly customerAuth = inject(CustomerAuthService);
  private readonly discounts = inject(DiscountsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  readonly promoCode = signal(
    this.shopping.appliedDiscount()?.code ?? '',
  );
  readonly appliedDiscount = this.shopping.appliedDiscount;
  readonly discountAmount = this.shopping.discountAmount;
  readonly applyingPromo = signal(false);
  readonly checkingOut = signal(false);
  readonly selectedLineForRemoval = signal<CustomerCartLine | null>(null);
  readonly removeModalVisible = signal(false);
  readonly removingItem = signal(false);

  isLoyaltyRedemption(productId: string, variantId: string | null = null): boolean {
    return this.loyalty.isRedemptionRequested(productId, variantId);
  }

  loyaltyPreview(line: CustomerCartLine) {
    return this.loyalty.preview(line.product.price);
  }

  cancelLoyaltyRedemption(productId: string, variantId: string | null = null): void {
    this.loyalty.clearProductRedemption(productId, variantId);
  }
  readonly removeItemError = signal<string | null>(null);
  readonly removeModalDescription = computed(() => {
    const productName = this.selectedLineForRemoval()?.product.name ?? 'this item';
    return `Are you sure you want to remove "${productName}" from your cart?`;
  });
  readonly freeGiftDiscount = signal<Discount | null>(null);
  readonly loadingFreeGiftDiscount = signal(false);
  readonly eligibleGiftProducts = signal<DiscountGiftProduct[]>([]);
  readonly loadingGiftProducts = signal(false);
  readonly selectingGiftProductId = signal<string | null>(null);
  readonly selectedGiftProductIds = computed(() =>
    this.shopping.freeGiftLines().map((line) => line.product.id),
  );
  readonly showGiftSelector = computed(() => {
    const applied = this.appliedDiscount();
    return applied?.discount_type === 'free_gift' && this.freeGiftUnlocked();
  });

  readonly freeGiftThreshold = computed(
    () => this.freeGiftDiscount()?.minimum_order_amount ?? 0,
  );

  readonly freeGiftUnlocked = computed(() => {
    const discount = this.freeGiftDiscount();

    if (!discount) {
      return false;
    }

    return this.shopping.subtotal() >= this.freeGiftThreshold();
  });

  readonly remainingForFreeGift = computed(() => {
    const threshold = this.freeGiftThreshold();

    if (!this.freeGiftDiscount() || threshold <= 0) {
      return 0;
    }

    return Math.max(0, threshold - this.shopping.subtotal());
  });

  readonly freeGiftProgress = computed(() => {
    if (!this.freeGiftDiscount()) {
      return 0;
    }

    const threshold = this.freeGiftThreshold();

    if (threshold <= 0) {
      return 100;
    }

    return Math.min(
      100,
      (this.shopping.subtotal() / threshold) * 100,
    );
  });

  readonly freeGiftCode = computed(
    () => this.freeGiftDiscount()?.code?.trim().toUpperCase() ?? '',
  );

  async copyFreeGiftCode(): Promise<void> {
    const code = this.freeGiftCode();

    if (!code || typeof navigator === 'undefined') {
      return;
    }

    try {
      await navigator.clipboard.writeText(code);

      this.toast.success(
        'Promo code copied',
        `${code} was copied to your clipboard.`,
      );
    } catch {
      this.toast.error(
        'Unable to copy code',
        'Please copy the promo code manually.',
      );
    }
  }

  readonly total = computed(() =>
    Math.max(
      0,
      this.shopping.subtotal() -
      this.shopping.discountAmount(),
    ),
  );
  readonly estimatedLoyaltyPoints = computed(() => {
    if (!this.customerAuth.isAuthenticated()) return 0;

    const eligibleSubtotal = this.shopping.cart().reduce(
      (subtotal, line) => line.isFreeGift || this.loyalty.isRedemptionRequested(
        line.product.id,
        line.product.variantId,
      )
        ? subtotal
        : subtotal + line.product.price * line.quantity,
      0,
    );

    return this.loyalty.estimateOrderPoints(
      eligibleSubtotal,
      this.shopping.discountAmount(),
    );
  });

  constructor() {
    effect(() => {
      const applied = this.appliedDiscount();
      if (applied && this.shopping.subtotal() < (applied.minimum_order_amount ?? 0)) {
        this.shopping.clearAppliedDiscount();
        if (applied.discount_type === 'free_gift') {
          this.eligibleGiftProducts.set([]);
          void this.shopping.clearFreeGiftSelection(applied.id);
        }
      }
    });
  }

  ngOnInit(): void {
    void this.loadFreeGiftDiscount();
    const applied = this.appliedDiscount();
    if (applied?.discount_type === 'free_gift') void this.loadEligibleGiftProducts(applied);
  }

  private async loadFreeGiftDiscount(): Promise<void> {
    if (this.loadingFreeGiftDiscount()) {
      return;
    }

    this.loadingFreeGiftDiscount.set(true);

    try {
      const discount =
        await this.discounts.getAutomaticFreeGiftDiscount();

      this.freeGiftDiscount.set(discount);
    } catch {
      this.freeGiftDiscount.set(null);
    } finally {
      this.loadingFreeGiftDiscount.set(false);
    }
  }

  private async loadEligibleGiftProducts(discount: Discount): Promise<void> {
    this.loadingGiftProducts.set(true);
    try {
      this.eligibleGiftProducts.set(
        (await this.discounts.getGiftProductsForDiscount(discount.id)).filter(
          (gift) => gift.isActive && gift.product.is_active !== false && Number(gift.product.stock ?? 0) > 0,
        ),
      );
    } catch {
      this.eligibleGiftProducts.set([]);
      this.toast.error('Unable to load gifts', 'Please try again.');
    } finally {
      this.loadingGiftProducts.set(false);
    }
  }

  async selectGift(productId: string): Promise<void> {
    const discount = this.appliedDiscount();
    if (discount?.discount_type !== 'free_gift' || this.selectingGiftProductId()) return;
    this.selectingGiftProductId.set(productId);
    try {
      await this.shopping.selectFreeGift(discount, productId);
    } catch (error) {
      this.toast.error(
        'Gift unavailable',
        error instanceof Error ? error.message : 'Please choose another free gift.',
      );
      await this.loadEligibleGiftProducts(discount);
    } finally {
      this.selectingGiftProductId.set(null);
    }
  }

  openRemoveModal(line: CustomerCartLine): void {
    if (this.removingItem()) return;
    this.selectedLineForRemoval.set(line);
    this.removeItemError.set(null);
    this.removeModalVisible.set(true);
  }

  closeRemoveModal(): void {
    if (this.removingItem()) return;
    this.removeModalVisible.set(false);
    this.selectedLineForRemoval.set(null);
    this.removeItemError.set(null);
  }

  async confirmRemoveItem(): Promise<void> {
    const line = this.selectedLineForRemoval();
    if (!line || this.removingItem()) return;

    this.removingItem.set(true);
    this.removeItemError.set(null);
    try {
      await this.shopping.removeFromCart(
        line.product.id,
        line.product.variantId,
        line.isFreeGift,
        line.appliedDiscountId,
      );
      this.loyalty.clearProductRedemption(line.product.id, line.product.variantId);
      this.toast.productRemoved(
        line.product.name,
        line.product.imageUrl,
      );
      this.removeModalVisible.set(false);
      this.selectedLineForRemoval.set(null);
      this.removeItemError.set(null);
    } catch {
      this.removeItemError.set('Unable to remove this item. Please try again.');
    } finally {
      this.removingItem.set(false);
    }
  }

  isRemovingLine(line: CustomerCartLine): boolean {
    const selected = this.selectedLineForRemoval();
    return Boolean(
      this.removingItem() &&
      selected &&
      this.shopping.lineKey(selected.product.id, selected.product.variantId) ===
      this.shopping.lineKey(line.product.id, line.product.variantId),
    );
  }

  async applyPromo(): Promise<void> {
    const code = this.promoCode().trim().toUpperCase();

    if (!code || this.applyingPromo()) {
      return;
    }

    this.applyingPromo.set(true);

    try {
      const discount = await this.discounts.getDiscountByCode(code);

      if (!discount) {
        this.toast.error(
          'Invalid promo code',
          'No promotion was found for this code.',
        );
        return;
      }

      if (!this.discounts.isDiscountAvailable(discount)) {
        this.toast.error(
          'Promo code unavailable',
          'This promotion is inactive, expired, scheduled, or exhausted.',
        );
        return;
      }

      const minimumOrderAmount =
        discount.minimum_order_amount ?? 0;

      if (this.shopping.subtotal() < minimumOrderAmount) {
        const remaining =
          minimumOrderAmount - this.shopping.subtotal();

        this.toast.error(
          'Minimum order not reached',
          `Add $${remaining.toFixed(2)} more to use this code.`,
        );
        return;
      }

      const eligibleSubtotal =
        this.shopping.getEligibleSubtotal(discount);

      if (eligibleSubtotal <= 0) {
        this.toast.error(
          'Promo not applicable',
          'This code does not apply to the products in your cart.',
        );
        return;
      }

      this.shopping.setAppliedDiscount(discount);
      this.promoCode.set(discount.code);

      if (discount.discount_type === 'free_gift') {
        await this.loadEligibleGiftProducts(discount);
      }

      this.toast.success(
        'Promo code applied',
        `${discount.code} was applied successfully.`,
      );
    } catch {
      this.toast.error(
        'Unable to validate promo code',
        'Please try again.',
      );
    } finally {
      this.applyingPromo.set(false);
    }
  }

  removePromo(): void {
    if (this.applyingPromo()) {
      return;
    }

    const removedCode = this.shopping.appliedDiscount()?.code;

    const removedDiscount = this.shopping.appliedDiscount();
    this.shopping.clearAppliedDiscount();
    if (removedDiscount?.discount_type === 'free_gift') {
      void this.shopping.clearFreeGiftSelection(removedDiscount.id);
      this.eligibleGiftProducts.set([]);
    }
    this.promoCode.set('');

    if (removedCode) {
      this.toast.info(
        'Promo code removed',
        `${removedCode} was removed from your order.`,
      );
    }
  }

  async checkout(): Promise<void> {
    if (!this.shopping.cart().length) {
      this.toast.info('Your cart is empty', 'Add an item before checkout.');
      return;
    }
    if (this.checkingOut()) return;

    this.checkingOut.set(true);
    try {
      await this.shopping.prepareCheckoutCart();
      await this.router.navigate(['/shop/checkout']);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error) {
      this.toast.error(
        'Unable to start checkout',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      this.checkingOut.set(false);
    }
  }
}
