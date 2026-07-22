import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CustomerOrderItem } from '../customer-order.model';

const PRODUCT_IMAGE_FALLBACK = 'assets/images/product-placeholder.png';

@Component({
  selector: 'app-customer-order-item',
  standalone: true,
  imports: [CurrencyPipe, RouterLink, TranslatePipe],
  templateUrl: './customer-order-item.component.html',
  styleUrl: './customer-order-item.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerOrderItemComponent {
  readonly item = input.required<CustomerOrderItem>();
  readonly imageFailed = signal(false);

  readonly imageUrl = computed(() =>
    this.imageFailed() || !this.item().productImageUrl
      ? PRODUCT_IMAGE_FALLBACK
      : this.item().productImageUrl,
  );
  readonly productUrl = computed(() => [
    '/shop/products',
    this.item().productSlug || this.item().productId,
  ]);
  readonly hasProductDetails = computed(() => Boolean(this.item().productName));

  handleImageError(): void {
    this.imageFailed.set(true);
  }
}
