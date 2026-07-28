import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { CustomerPromotionsService } from '../../../../services/customer-promotions.service';
import { PromotionDetailsData } from '../../../../models';
import { CustomerProductCardComponent } from '../../../../../customer/components/customer-product-card';

@Component({
  selector: 'app-promotion-details',
  standalone: true,
  imports: [RouterLink, CustomerProductCardComponent],
  templateUrl: './promotion-details.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromotionDetails {
  private readonly route = inject(ActivatedRoute);
  private readonly promotionsService = inject(CustomerPromotionsService);

  readonly promotion = signal<PromotionDetailsData | null>(null);
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
    } catch (error) {
      console.error('Unable to load promotion.', error);
      this.unavailable.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
