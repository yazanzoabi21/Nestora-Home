import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { Promotion } from '../../../../../../../data-access';
import { CustomerEmptyStateComponent } from '../../../../../components';
import { CustomerPromotionsService } from '../../../../../services/customer-promotions.service';

@Component({
  selector: 'app-customer-flash-deals',
  standalone: true,
  imports: [CustomerEmptyStateComponent, RouterLink, TranslatePipe],
  templateUrl: './customer-flash-deals.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerFlashDeals {
  private readonly destroyRef = inject(DestroyRef);
  private readonly promotionsService = inject(CustomerPromotionsService);

  readonly promotions = input<readonly Promotion[]>([]);

  private readonly currentTime = signal(Date.now());

  readonly deadline = computed<number | null>(() => {
    const validDeadlines = this.promotions()
      .map((promotion) => promotion.end_date)
      .filter((date): date is string => Boolean(date))
      .map((date) => new Date(date).getTime())
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp > this.currentTime());

    return validDeadlines.length ? Math.min(...validDeadlines) : null;
  });

  readonly countdown = computed(() => {
    const deadline = this.deadline();

    if (!deadline) {
      return {
        hours: '00',
        minutes: '00',
        seconds: '00',
      };
    }

    const remainingMilliseconds = Math.max(deadline - this.currentTime(), 0);

    const totalSeconds = Math.floor(remainingMilliseconds / 1000);

    return {
      hours: String(Math.floor(totalSeconds / 3600)).padStart(2, '0'),
      minutes: String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0'),
      seconds: String(totalSeconds % 60).padStart(2, '0'),
    };
  });

  constructor() {
    const intervalId = window.setInterval(() => {
      this.currentTime.set(Date.now());
    }, 1000);

    this.destroyRef.onDestroy(() => {
      window.clearInterval(intervalId);
    });
  }

  promotionLink(promotion: Promotion): string {
    return this.promotionsService.promotionLink(promotion);
  }
}
