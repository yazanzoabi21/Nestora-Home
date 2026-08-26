import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import {
  CustomerProductCardComponent,
  CustomerProductCardSkeleton,
  CustomerProductQuickViewComponent,
} from '../../components';
import { CustomerProductAddRequest } from '../../components/customer-product-quick-view';
import { CustomerProduct } from '../../models';
import { CustomerCatalogService, CustomerShoppingStateService } from '../../services';

@Component({
  selector: 'app-best-sellers',
  standalone: true,
  imports: [
    CustomerProductCardComponent,
    CustomerProductCardSkeleton,
    CustomerProductQuickViewComponent,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: './best-sellers.html',
  styleUrl: './best-sellers.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BestSellersPage {
  readonly shopping = inject(CustomerShoppingStateService);

  private readonly catalog = inject(CustomerCatalogService);

  readonly products = signal<CustomerProduct[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly selectedProduct = signal<CustomerProduct | null>(null);
  readonly loadingCards = [1, 2, 3, 4, 5, 6, 7, 8];

  constructor() {
    effect(() => {
      const products = this.catalog.productsSnapshot();
      if (products) untracked(() => this.replaceProducts(products));
    });
    void this.load();
  }

  async retry(): Promise<void> {
    await this.load();
  }

  openQuickView(product: CustomerProduct): void {
    this.selectedProduct.set(product);
  }

  closeQuickView(): void {
    this.selectedProduct.set(null);
  }

  async addToCart(product: CustomerProduct, quantity = 1): Promise<void> {
    await this.shopping.addToCart(product, quantity);
  }

  async addFromQuickView(request: CustomerProductAddRequest): Promise<void> {
    await this.addToCart(request.product, request.quantity);
  }

  async toggleWishlist(product: CustomerProduct): Promise<void> {
    await this.shopping.toggleWishlist(product);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);

    try {
      this.replaceProducts(await this.catalog.getBestSellers());
    } catch (error) {
      console.error('Unable to load best sellers.', error);
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private replaceProducts(products: readonly CustomerProduct[]): void {
    const sortedProducts = [...products]
      .filter((product) => product.isActive)
      .sort(
        (first, second) =>
          second.soldCount - first.soldCount ||
          second.rating - first.rating ||
          second.reviewCount - first.reviewCount,
      );
    this.products.set(sortedProducts);

    const selectedProductId = this.selectedProduct()?.id;
    if (selectedProductId) {
      this.selectedProduct.set(
        sortedProducts.find((product) => product.id === selectedProductId) ?? null,
      );
    }
  }
}
