import { CurrencyPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CustomerProduct } from '../../models';

export type CustomerProductCardView = 'grid' | 'list';

@Component({
  selector: 'app-customer-product-card',
  standalone: true,
  imports: [CurrencyPipe, RouterLink, TranslatePipe],
  templateUrl: './customer-product-card.component.html',
  styleUrl: './customer-product-card.component.css',
})
export class CustomerProductCardComponent {
  readonly product = input.required<CustomerProduct>();
  readonly view = input<CustomerProductCardView>('grid');
  readonly wishlistActive = input(false);
  readonly cartLoading = input(false);
  readonly canAddToCart = input(true);
  readonly selected = input(false);

  readonly quickView = output<CustomerProduct>();
  readonly addToCart = output<CustomerProduct>();
  readonly toggleWishlist = output<CustomerProduct>();

  readonly starItems = [1, 2, 3, 4, 5];

  readonly detailUrl = computed(() => ['/shop/products', this.product().slug || this.product().id]);
  readonly soldOut = computed(() => this.product().stock <= 0 || !this.product().inStock);

  requestAddToCart(event: Event): void {
    event.stopPropagation();
    if (this.soldOut() || !this.canAddToCart() || this.cartLoading()) {
      return;
    }

    this.addToCart.emit(this.product());
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
