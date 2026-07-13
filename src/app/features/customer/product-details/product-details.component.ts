import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ProductReviewsComponent } from '../components/product-reviews';
import { CustomerProductDetails } from '../models';
import { CustomerShoppingStateService, NewArrivalsService } from '../services';

type DetailsTab = 'description' | 'features' | 'reviews';

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, RouterLink, ProductReviewsComponent, TranslatePipe],
  templateUrl: './product-details.component.html',
  styleUrl: './product-details.component.css',
})
export class ProductDetailsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalog = inject(NewArrivalsService);
  readonly shopping = inject(CustomerShoppingStateService);
  readonly product = signal<CustomerProductDetails | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly quantity = signal(1);
  readonly selectedImage = signal('');
  readonly activeTab = signal<DetailsTab>('description');
  readonly stars = [1, 2, 3, 4, 5];
  readonly returnUrl = this.router.url;
  readonly wishlisted = computed(() =>
    this.product() ? this.shopping.wishlistIds().has(this.product()!.id) : false,
  );
  readonly savings = computed(() => {
    const item = this.product();
    return item?.originalPrice && item.originalPrice > item.price
      ? item.originalPrice - item.price
      : null;
  });

  constructor() {
    void this.load();
  }
  decrease(): void {
    this.quantity.update((value) => Math.max(1, value - 1));
  }
  increase(): void {
    const stock = this.product()?.stock ?? 1;
    this.quantity.update((value) => Math.min(stock, value + 1));
  }
  addToCart(): void {
    const item = this.product();
    if (item) {
      this.shopping.addToCart(item, this.quantity());
    }
  }
  buyNow(): void {
    this.addToCart();
    void this.router.navigate(['/shop']);
  }
  toggleWishlist(): void {
    const item = this.product();
    if (item) {
      this.shopping.toggleWishlist(item.id);
    }
  }
  selectTab(tab: DetailsTab): void {
    this.activeTab.set(tab);
  }
  private async load(): Promise<void> {
    const identifier = this.route.snapshot.paramMap.get('identifier');
    if (!identifier) {
      this.loading.set(false);
      return;
    }
    try {
      const item = await this.catalog.getProductDetails(identifier);
      this.product.set(item);
      this.selectedImage.set(item?.gallery[0] || item?.imageUrl || '');
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
