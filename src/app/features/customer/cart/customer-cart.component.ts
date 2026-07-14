import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ToastService } from '../../../core/services';
import { Discount, DiscountsService } from '../../../data-access';
import { CustomerShoppingStateService } from '../services';

const FREE_SHIPPING_THRESHOLD = 75;
const STANDARD_SHIPPING = 7.99;

@Component({
  selector: 'app-customer-cart',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './customer-cart.component.html',
  styleUrl: './customer-cart.component.css',
})
export class CustomerCartComponent {
  readonly shopping = inject(CustomerShoppingStateService);
  private readonly discounts = inject(DiscountsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  readonly promoCode = signal('');
  readonly appliedDiscount = signal<Discount | null>(null);
  readonly applyingPromo = signal(false);
  readonly shippingThreshold = FREE_SHIPPING_THRESHOLD;
  readonly remainingForFreeShipping = computed(() =>
    Math.max(0, FREE_SHIPPING_THRESHOLD - this.shopping.subtotal()),
  );
  readonly shippingProgress = computed(() =>
    Math.min(100, (this.shopping.subtotal() / FREE_SHIPPING_THRESHOLD) * 100),
  );
  readonly shipping = computed(() =>
    this.shopping.subtotal() >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING,
  );
  readonly discountAmount = computed(() => {
    const discount = this.appliedDiscount();
    if (!discount) return 0;
    const eligible = this.shopping
      .cart()
      .filter(
        (line) =>
          discount.applies_to === 'all' ||
          discount.product_id === line.product.id ||
          (discount.applies_to === 'category' &&
            line.product.category === discount.categories?.name),
      );
    const base = eligible.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
    if (discount.discount_type === 'percentage')
      return (base * Math.min(100, discount.discount_value ?? 0)) / 100;
    if (discount.discount_type === 'fixed_amount')
      return Math.min(base, discount.discount_value ?? 0);
    return 0;
  });
  readonly total = computed(() =>
    Math.max(
      0,
      this.shopping.subtotal() +
        (this.appliedDiscount()?.discount_type === 'free_shipping' ? 0 : this.shipping()) -
        this.discountAmount(),
    ),
  );

  async applyPromo(): Promise<void> {
    const code = this.promoCode().trim().toUpperCase();
    if (!code || this.applyingPromo()) return;
    this.applyingPromo.set(true);
    try {
      const discount = (await this.discounts.getDiscounts()).find((item) => item.code === code);
      const valid =
        discount &&
        this.discounts.getDiscountStatus(discount) === 'active' &&
        (discount.usage_limit === null || discount.usage_count < discount.usage_limit) &&
        this.shopping.subtotal() >= (discount.minimum_order_amount ?? 0);
      if (!valid) {
        this.appliedDiscount.set(null);
        this.toast.error(
          'Invalid promo code',
          'This code is expired, inactive, exhausted, or does not apply.',
        );
        return;
      }
      const applies =
        discount.applies_to === 'all' ||
        this.shopping
          .cart()
          .some(
            (line) =>
              discount.product_id === line.product.id ||
              (discount.applies_to === 'category' &&
                line.product.category === discount.categories?.name),
          );
      if (!applies) {
        this.toast.error('Promo not applicable');
        return;
      }
      this.appliedDiscount.set(discount);
      this.toast.success('Promo code applied');
    } catch {
      this.toast.error('Unable to validate promo code');
    } finally {
      this.applyingPromo.set(false);
    }
  }
  checkout(): void {
    if (!this.shopping.cart().length) {
      this.toast.info('Your cart is empty', 'Add an item before checkout.');
      return;
    }
    void this.router.navigate(['/shop/checkout']).then(() => {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }
}
