import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CustomerProduct } from '../../models';
import { CustomerShoppingStateService, LoyaltyPointsCalculatorService } from '../../services';
import { CustomerLoyaltyPointsBadgeComponent } from '../../../../shared/components/customer-loyalty-points-badge';
import { CustomerAuthService } from '../../../../core/services/auth';

export type CustomerProductCardView = 'grid' | 'list';
type CustomerProductDetailQueryParams = Readonly<Record<string, string>>;

@Component({
  selector: 'app-customer-product-card',
  standalone: true,
  imports: [CurrencyPipe, CustomerLoyaltyPointsBadgeComponent, RouterLink, TranslatePipe],
  templateUrl: './customer-product-card.component.html',
  styleUrl: './customer-product-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerProductCardComponent {
  readonly loyalty = inject(LoyaltyPointsCalculatorService);
  readonly customerAuth = inject(CustomerAuthService);
  private readonly shopping = inject(CustomerShoppingStateService);
  private readonly router = inject(Router);
  readonly product = input.required<CustomerProduct>();
  readonly detailQueryParams = input<CustomerProductDetailQueryParams | null>(null);
  readonly view = input<CustomerProductCardView>('grid');
  readonly wishlistActive = input(false);
  readonly wishlistLoading = input(false);
  readonly cartLoading = input(false);
  readonly canAddToCart = input(true);
  readonly selected = input(false);
  readonly compact = input(false);
  readonly showQuickView = input(true);

  readonly quickView = output<CustomerProduct>();
  readonly addToCart = output<CustomerProduct>();
  readonly toggleWishlist = output<CustomerProduct>();
  readonly detailNavigation = output<CustomerProduct>();

  readonly starItems = [1, 2, 3, 4, 5];

  readonly detailUrl = computed(() => ['/shop/products', this.product().slug || this.product().id]);
  readonly soldOut = computed(() => this.product().stock <= 0 || !this.product().inStock);
  readonly loyaltyPreview = computed(() => this.loyalty.preview(this.product().price));
  readonly cartQuantity = computed(() =>
    this.shopping.quantityFor(this.product().id, this.product().variantId),
  );
  readonly cartPending = computed(
    () => this.cartLoading() || this.shopping.pendingProductIds().has(this.product().id),
  );
  readonly canAddAnother = computed(
    () => this.canAddToCart() && this.shopping.canAdd(this.product()),
  );

  readonly canIncreaseCartQuantity = computed(
    () =>
      this.cartQuantity() > 0 &&
      !this.soldOut() &&
      !this.cartPending() &&
      this.canAddAnother(),
  );

  loyaltyReturnUrl(): string {
    return this.router.url;
  }

  notifyDetailNavigation(event: MouseEvent): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    this.detailNavigation.emit(this.product());
  }

  decreaseCartQuantity(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const currentQuantity = this.cartQuantity();

    if (this.cartPending() || currentQuantity < 1) {
      return;
    }

    if (currentQuantity === 1) {
      void this.shopping.removeFromCart(this.product().id, this.product().variantId);
      return;
    }

    void this.shopping.setQuantity(
      this.product().id,
      currentQuantity - 1,
      this.product().variantId,
    );
  }

  increaseCartQuantity(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.canIncreaseCartQuantity()) {
      return;
    }

    void this.shopping.setQuantity(
      this.product().id,
      this.cartQuantity() + 1,
      this.product().variantId,
    );
  }

  requestAddToCart(event: Event): void {
    event.stopPropagation();
    if (this.soldOut() || !this.canAddAnother() || this.cartPending()) {
      return;
    }

    this.addToCart.emit(this.product());
  }

  requestToggleWishlist(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.wishlistLoading()) this.toggleWishlist.emit(this.product());
  }

  isFilledStar(star: number): boolean {
    return star <= Math.round(this.product().rating);
  }

  hasValidDiscount(): boolean {
    const originalPrice = this.product().originalPrice;
    return (
      typeof originalPrice === 'number' && originalPrice > 0 && originalPrice > this.product().price
    );
  }

  safeDiscountPercentage(): number {
    const originalPrice = this.product().originalPrice;
    if (!this.hasValidDiscount() || !originalPrice) {
      return 0;
    }
    return Math.max(
      0,
      Math.min(100, Math.round(((originalPrice - this.product().price) / originalPrice) * 100)),
    );
  }
}
