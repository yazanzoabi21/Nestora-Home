import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CustomerProduct } from '../../models';
import { CustomerRecentlyViewedService } from '../../services';

export interface CustomerProductAddRequest {
  product: CustomerProduct;
  quantity: number;
}

@Component({
  selector: 'app-customer-product-quick-view',
  standalone: true,
  imports: [CurrencyPipe, TranslatePipe, RouterLink],
  templateUrl: './customer-product-quick-view.component.html',
  styleUrl: './customer-product-quick-view.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerProductQuickViewComponent {
  private readonly recentlyViewed = inject(CustomerRecentlyViewedService);

  readonly product = input.required<CustomerProduct>();
  readonly wishlistActive = input(false);
  readonly cartLoading = input(false);
  readonly availableQuantity = input(0);

  readonly closeRequested = output<void>();
  readonly addRequested = output<CustomerProductAddRequest>();
  readonly toggleWishlist = output<CustomerProduct>();

  readonly starItems = [1, 2, 3, 4, 5];
  readonly quantity = signal(1);
  readonly subtotal = computed(() => this.product().price * this.quantity());

  constructor() {
    effect(() => {
      void this.recentlyViewed.recordView(this.product().id);
    });
  }

  isFilledStar(star: number): boolean {
    return star <= Math.round(this.product().rating);
  }

  savingsAmount(product: CustomerProduct): number | null {
    if (!product.originalPrice || product.originalPrice <= product.price) {
      return null;
    }

    return product.originalPrice - product.price;
  }

  readonly detailUrl = computed(() => ['/shop/products', this.product().slug || this.product().id]);

  decreaseQuantity(): void {
    this.quantity.update((quantity) => Math.max(1, quantity - 1));
  }

  increaseQuantity(): void {
    if (this.quantity() < this.availableQuantity()) {
      this.quantity.update((quantity) => quantity + 1);
    }
  }

  submitAddToCart(): void {
    this.addRequested.emit({ product: this.product(), quantity: this.quantity() });
  }
}
