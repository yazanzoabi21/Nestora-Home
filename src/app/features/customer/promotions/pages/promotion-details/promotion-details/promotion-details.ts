import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CustomerPromotionsService } from '../../../../services/customer-promotions.service';
import { PromotionDetailsData } from '../../../../models';
import { CustomerProductCardComponent } from '../../../../../customer/components/customer-product-card';
import {
  AdminPaginationComponent,
  PaginationPageSize,
} from '../../../../../../shared/ui/admin-pagination';

@Component({
  selector: 'app-promotion-details',
  standalone: true,
  imports: [RouterLink, CustomerProductCardComponent, TranslatePipe, AdminPaginationComponent],
  templateUrl: './promotion-details.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromotionDetails {
  private readonly route = inject(ActivatedRoute);
  private readonly promotionsService = inject(CustomerPromotionsService);
  private readonly productsList = viewChild<ElementRef<HTMLElement>>('productsList');

  readonly promotion = signal<PromotionDetailsData | null>(null);
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

  changePage(page: number): void {
    this.currentPage.set(page);

    queueMicrotask(() => {
      const list = this.productsList()?.nativeElement;

      list?.focus({ preventScroll: true });
      list?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  setPageSize(size: PaginationPageSize): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }
}
