import { CurrencyPipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CustomerProduct } from '../../models';

@Component({
  selector: 'app-customer-product-quick-view',
  standalone: true,
  imports: [CurrencyPipe, TranslatePipe],
  templateUrl: './customer-product-quick-view.component.html',
  styleUrl: './customer-product-quick-view.component.css',
})
export class CustomerProductQuickViewComponent {
  readonly product = input.required<CustomerProduct>();
  readonly wishlistActive = input(false);

  readonly close = output<void>();
  readonly addToCart = output<CustomerProduct>();
  readonly toggleWishlist = output<CustomerProduct>();

  readonly starItems = [1, 2, 3, 4, 5];
  readonly colorOptions = ['Matte White', 'Matte Black', 'Rose Gold'];
  readonly selectedColor = signal(this.colorOptions[0]);
  readonly quantity = signal(1);
  readonly subtotal = computed(() => this.product().price * this.quantity());

  isFilledStar(star: number): boolean {
    return star <= Math.round(this.product().rating);
  }

  savingsAmount(product: CustomerProduct): number | null {
    if (!product.originalPrice || product.originalPrice <= product.price) {
      return null;
    }

    return product.originalPrice - product.price;
  }

  selectColor(color: string): void {
    this.selectedColor.set(color);
  }

  decreaseQuantity(): void {
    this.quantity.update((quantity) => Math.max(1, quantity - 1));
  }

  increaseQuantity(): void {
    this.quantity.update((quantity) => Math.min(this.product().stock, quantity + 1));
  }
}
