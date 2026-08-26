import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { Promotion } from '../../../../../../data-access';
import { CustomerPromotionsService } from '../../../../services/customer-promotions.service';

@Component({
  selector: 'app-flash-deals-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './flash-deals-page.html',
  styleUrl: './flash-deals-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashDealsPage {
  private readonly promotionsService = inject(CustomerPromotionsService);

  readonly promotions = signal<Promotion[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly loadingCards = [1, 2, 3, 4, 5, 6];

  constructor() {
    void this.loadPromotions();
  }

  async retry(): Promise<void> {
    await this.loadPromotions();
  }

  promotionLink(promotion: Promotion): string {
    return this.promotionsService.promotionLink(promotion);
  }

  private async loadPromotions(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);

    try {
      this.promotions.set(await this.promotionsService.getFlashDealPromotions());
    } catch (error) {

      this.promotions.set([]);
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
