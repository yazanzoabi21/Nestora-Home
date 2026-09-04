import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CustomerPromotionsService } from '../../../../services/customer-promotions.service';
import { CustomerShoppingStateService } from '../../../../services';
import { CustomerProduct, PromotionDetailsData } from '../../../../models';
import {
  CustomerProductAddRequest,
  CustomerProductQuickViewComponent,
} from '../../../../components/customer-product-quick-view';
import { CustomerProductCardComponent } from '../../../../components/customer-product-card';
import {
  AdminPaginationComponent,
  PaginationPageSize,
} from '../../../../../../shared/ui/admin-pagination';
import { PaginationScrollAnchorDirective } from '../../../../../../shared/directives';

@Component({
  selector: 'app-promotion-details',
  standalone: true,
  imports: [
    RouterLink,
    CustomerProductCardComponent,
    CustomerProductQuickViewComponent,
    TranslatePipe,
    AdminPaginationComponent,
    PaginationScrollAnchorDirective,
  ],
  templateUrl: './promotion-details.html',
  styleUrl: '../../../../pages/all-products/all-products.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromotionDetails {
  readonly shopping = inject(CustomerShoppingStateService);

  private readonly route = inject(ActivatedRoute);
  private readonly promotionsService = inject(CustomerPromotionsService);

  readonly promotion = signal<PromotionDetailsData | null>(null);
  readonly selectedProduct = signal<CustomerProduct | null>(null);
  readonly productDetailQueryParams = computed<Readonly<Record<string, string>> | null>(() => {
    const promotionSlug = this.promotion()?.slug?.trim();

    return promotionSlug ? { promotion: promotionSlug } : null;
  });
  readonly currentPage = signal(1);
  readonly pageSize = signal<PaginationPageSize>(12);
  readonly promotionProducts = computed(() =>
    (this.promotion()?.promotion_products ?? []).map((item) => {
      const promotionalPrice = item.promotional_price;

      if (
        promotionalPrice === null ||
        promotionalPrice === undefined ||
        promotionalPrice >= item.product.price
      ) {
        return item.product;
      }

      return {
        ...item.product,

        // Price displayed as the current promotion price
        price: promotionalPrice,

        // Original price displayed with a line through it
        originalPrice: item.product.price,
      };
    }),
  );
  readonly paginatedProducts = computed(() => {
    const products = this.promotionProducts();
    const size = this.pageSize();

    if (size === 'all') {
      return products;
    }

    const start = (this.currentPage() - 1) * size;
    return products.slice(start, start + size);
  });
  readonly loading = signal(true);
  readonly unavailable = signal(false);

  constructor() {
    void this.loadPromotion();
  }

  private async loadPromotion(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug');

    if (!slug) {
      this.unavailable.set(true);
      this.loading.set(false);
      return;
    }

    try {
      const promotion = await this.promotionsService.getPromotionBySlug(slug);

      if (!promotion || !this.promotionsService.isActive(promotion)) {
        this.unavailable.set(true);
        return;
      }

      this.promotion.set(promotion);
      this.currentPage.set(1);
    } catch {
      this.unavailable.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  scrollToPromotionProducts(): void {
    const productsSection = document.getElementById(
      'promotion-products',
    );

    productsSection?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
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

  changePage(page: number): void {
    this.currentPage.set(page);
    this.selectedProduct.set(null);
  }

  setPageSize(size: PaginationPageSize): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.selectedProduct.set(null);
  }
}
