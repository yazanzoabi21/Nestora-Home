import { CurrencyPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { DiscountGiftProduct } from '../../../../data-access';

@Component({
  selector: 'app-customer-free-gift-selector',
  standalone: true,
  imports: [CurrencyPipe, NgTemplateOutlet, TranslatePipe],
  templateUrl: './customer-free-gift-selector.component.html',
  styleUrl: './customer-free-gift-selector.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerFreeGiftSelectorComponent {
  readonly gifts = input<readonly DiscountGiftProduct[]>([]);
  readonly selectedProductIds = input<readonly string[]>([]);
  readonly allowedQuantity = input(1);
  readonly loading = input(false);
  readonly selectingProductId = input<string | null>(null);
  readonly giftSelected = output<string>();

  readonly allGiftsOpen = signal(false);
  readonly previewGifts = computed(() => this.gifts().slice(0, 4));
  readonly hasMore = computed(() => this.gifts().length > this.previewGifts().length);

  constructor() {
    effect((onCleanup) => {
      if (!this.allGiftsOpen() || typeof document === 'undefined') return;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      onCleanup(() => { document.body.style.overflow = previousOverflow; });
    });
  }

  isSelected(productId: string): boolean {
    return this.selectedProductIds().includes(productId);
  }

  select(productId: string): void {
    if (!this.selectingProductId()) this.giftSelected.emit(productId);
  }

  closeAll(): void {
    this.allGiftsOpen.set(false);
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeAll();
  }

  displayPrice(gift: DiscountGiftProduct): number {
    const product = gift.product;
    return product.sale_price !== null && product.sale_price < product.price
      ? product.sale_price
      : product.price;
  }
}
