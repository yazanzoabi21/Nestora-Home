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
  readonly selected = input(false);

  readonly quickView = output<CustomerProduct>();
  readonly addToCart = output<CustomerProduct>();
  readonly toggleWishlist = output<CustomerProduct>();

  readonly starItems = [1, 2, 3, 4, 5];

  readonly detailUrl = computed(() => ['/shop/products']);

  isFilledStar(star: number): boolean {
    return star <= Math.round(this.product().rating);
  }
}
