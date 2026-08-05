import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CustomerProduct } from '../../models';
import { LoyaltyPointsCalculatorService } from '../../services';
import { CustomerLoyaltyPointsBadgeComponent } from '../../../../shared/components/customer-loyalty-points-badge';
import { CustomerAuthService } from '../../../../core/services/auth';

export type CustomerProductCardView = 'grid' | 'list';

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
  private readonly router = inject(Router);
  readonly product = input.required<CustomerProduct>();
  readonly view = input<CustomerProductCardView>('grid');
  readonly wishlistActive = input(false);
  readonly wishlistLoading = input(false);
  readonly cartLoading = input(false);
  readonly canAddToCart = input(true);
  readonly selected = input(false);
  readonly compact = input(false);

  readonly quickView = output<CustomerProduct>();
  readonly addToCart = output<CustomerProduct>();
  readonly toggleWishlist = output<CustomerProduct>();

  readonly starItems = [1, 2, 3, 4, 5];

  readonly detailUrl = computed(() => ['/shop/products', this.product().slug || this.product().id]);
  readonly soldOut = computed(() => this.product().stock <= 0 || !this.product().inStock);
  readonly loyaltyPreview = computed(() => this.loyalty.preview(this.product().price));

  readonly cartQuantity = input(0);
  readonly cartQuantityChange = output<{
    product: CustomerProduct;
    quantity: number;
  }>();

  readonly canIncreaseCartQuantity = computed(
    () =>
      this.cartQuantity() > 0 &&
      !this.soldOut() &&
      !this.cartLoading() &&
      this.canAddToCart(),
  );

  loyaltyReturnUrl(): string {
    return this.router.url;
  }

  decreaseCartQuantity(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const currentQuantity = this.cartQuantity();

    if (this.cartLoading() || currentQuantity < 1) {
      return;
    }

    this.cartQuantityChange.emit({
      product: this.product(),
      quantity: currentQuantity - 1,
    });
  }

  increaseCartQuantity(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.canIncreaseCartQuantity()) {
      return;
    }

    this.cartQuantityChange.emit({
      product: this.product(),
      quantity: this.cartQuantity() + 1,
    });
  }

  requestAddToCart(event: Event): void {
    event.stopPropagation();
    if (this.soldOut() || !this.canAddToCart() || this.cartLoading()) {
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
