import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ToastService } from '../../../core/services';
import { CustomerAuthService } from '../../../core/services/auth';
import { Discount, DiscountsService } from '../../../data-access';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import { CustomerLoyaltyPointsBadgeComponent } from '../../../shared/components/customer-loyalty-points-badge';
import { CustomerCartLine } from '../models';
import { CustomerShoppingStateService, LoyaltyPointsCalculatorService } from '../services';

// const STANDARD_SHIPPING = 7.99;

@Component({
  selector: 'app-customer-cart',
  standalone: true,
  imports: [AdminFormModalComponent, CurrencyPipe, CustomerLoyaltyPointsBadgeComponent, FormsModule, RouterLink, TranslatePipe],
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
  // readonly appliedDiscount = signal<Discount | null>(null);
  // readonly applyingPromo = signal(false);
  readonly checkingOut = signal(false);
  readonly selectedLineForRemoval = signal<CustomerCartLine | null>(null);
  readonly removeModalVisible = signal(false);
  readonly removingItem = signal(false);

  isLoyaltyRedemption(productId: string): boolean {
    return this.loyalty.requestedRedemptionProductIds().includes(productId);
  }

  loyaltyPreview(line: CustomerCartLine) {
    return this.loyalty.preview(line.product.price);
  }

  cancelLoyaltyRedemption(productId: string): void {
    this.loyalty.clearProductRedemption(productId);
  }
  readonly removeItemError = signal<string | null>(null);
  readonly shippingThreshold = computed(
    () => this.freeShippingDiscount()?.minimum_order_amount ?? 0,
  );
  readonly freeShippingUnlocked = computed(() => {
    const discount = this.freeShippingDiscount();

    if (!discount) {
      return false;
    }

    return this.shopping.subtotal() >= this.shippingThreshold();
  });
  readonly removeModalDescription = computed(() => {
    const productName = this.selectedLineForRemoval()?.product.name ?? 'this item';
    return `Are you sure you want to remove "${productName}" from your cart?`;
  });
  readonly remainingForFreeShipping = computed(() => {
    const threshold = this.shippingThreshold();

    if (!this.freeShippingDiscount() || threshold <= 0) {
      return 0;
    }

    return Math.max(0, threshold - this.shopping.subtotal());
  });
  readonly shippingProgress = computed(() => {
    if (!this.freeShippingDiscount()) {
      return 0;
    }

    const threshold = this.shippingThreshold();

    if (threshold <= 0) {
      return 100;
    }

    return Math.min(100, (this.shopping.subtotal() / threshold) * 100);
  });
  // readonly shipping = computed(() =>
  //   this.freeShippingUnlocked() ? 0 : STANDARD_SHIPPING,
  // );
  // readonly discountAmount = computed(() => {
  //   const discount = this.appliedDiscount();

  //   if (!discount) {
  //     return 0;
  //   }

  //   const eligibleSubtotal = this.getEligibleSubtotal(discount);

  //   if (eligibleSubtotal <= 0) {
  //     return 0;
  //   }

  //   switch (discount.discount_type) {
  //     case 'percentage': {
  //       const percentage = Math.min(
  //         100,
  //         Math.max(0, discount.discount_value ?? 0),
  //       );

  //       return (eligibleSubtotal * percentage) / 100;
  //     }

  //     case 'fixed_amount': {
  //       return Math.min(
  //         eligibleSubtotal,
  //         Math.max(0, discount.discount_value ?? 0),
  //       );
  //     }

  //     default:
  //       return 0;
  //   }
  // });
  // private getEligibleSubtotal(discount: Discount): number {
  //   return this.shopping
  //     .cart()
  //     .filter((line) => {
  //       if (discount.applies_to === 'all') {
  //         return true;
  //       }

  //       if (discount.applies_to === 'product') {
  //         return discount.product_id === line.product.id;
  //       }

  //       if (discount.applies_to === 'category') {
  //         return line.product.category === discount.categories?.name;
  //       }

  //       return false;
  //     })
  //     .reduce(
  //       (total, line) =>
  //         total + line.product.price * line.quantity,
  //       0,
  //     );
  // }

  readonly total = computed(() =>
    Math.max(
      0,
      this.shopping.subtotal() -
      this.shopping.discountAmount(),
    ),
  );
  readonly estimatedLoyaltyPoints = computed(() => {
    if (!this.customerAuth.isAuthenticated()) return 0;

    const redeemedIds = new Set(this.loyalty.requestedRedemptionProductIds());
    const eligibleSubtotal = this.shopping.cart().reduce(
      (subtotal, line) => redeemedIds.has(line.product.id)
        ? subtotal
        : subtotal + line.product.price * line.quantity,
      0,
    );

    return this.loyalty.estimateOrderPoints(
      eligibleSubtotal,
      this.shopping.discountAmount(),
    );
  });

  readonly freeShippingDiscount = signal<Discount | null>(null);
  readonly loadingShippingDiscount = signal(false);

  ngOnInit(): void {
    void this.loadFreeShippingDiscount();
  }

  private async loadFreeShippingDiscount(): Promise<void> {
    if (this.loadingShippingDiscount()) {
      return;
    }

    this.loadingShippingDiscount.set(true);

    try {
      const discount =
        await this.discounts.getAutomaticFreeShippingDiscount();

      this.freeShippingDiscount.set(discount);
    } catch {
      this.freeShippingDiscount.set(null);

      this.toast.error(
        'Unable to load shipping offer',
        'Standard shipping will be used.',
      );
    } finally {
      this.loadingShippingDiscount.set(false);
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
      await this.shopping.removeFromCart(line.product.id);
      this.loyalty.clearProductRedemption(line.product.id);
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
    return this.removingItem() && this.selectedLineForRemoval()?.product.id === line.product.id;
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

      /*
       * Free shipping is automatically controlled by the shipping bar.
       * It is not applied through the percentage/fixed promo form.
       */
      if (discount.discount_type === 'free_shipping') {
        this.toast.info(
          'Automatic shipping offer',
          'Free shipping is applied automatically when the required cart amount is reached.',
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

    this.shopping.clearAppliedDiscount();
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
