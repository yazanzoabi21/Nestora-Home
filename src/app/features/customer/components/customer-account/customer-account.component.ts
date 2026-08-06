import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CustomerAuthService } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services/toast.service';
import { CUSTOMER_SUPABASE } from '../../../../core/tokens';
import { CustomerOrdersService } from '../../orders/customer-orders.service';
import { CustomerShoppingStateService, LoyaltyPointsCalculatorService } from '../../services';
import { CountBadgeComponent } from '../../../../shared/ui/count-badge';
// import { CustomerSettings } from '../customer-settings';

interface AccountCounts {
  orders: number;
  wishlist: number;
  reviews: number;
  points: number;
}

type AccountCountKey = keyof AccountCounts;

interface AccountNavItem {
  labelKey: string;
  icon: string;
  path: string;
  badgeKey?: AccountCountKey;
}

type CustomerAccountTab =
  | 'profile'
  | 'orders'
  | 'wishlist'
  | 'addresses'
  | 'settings';

@Component({
  selector: 'app-customer-account',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe, CountBadgeComponent],
  templateUrl: './customer-account.component.html',
  styleUrl: './customer-account.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerAccountComponent {
  readonly auth = inject(CustomerAuthService);

  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly shopping = inject(CustomerShoppingStateService);
  private readonly customerOrders = inject(CustomerOrdersService);
  private readonly toast = inject(ToastService);
  readonly loyalty = inject(LoyaltyPointsCalculatorService);
  readonly showLoyalty = computed(
    () => !this.loyalty.loading() && this.loyalty.enabled(),
  );

  readonly isLoggingOut = signal(false);
  private readonly loadedCounts = signal({ orders: 0, reviews: 0 });
  readonly counts = computed<AccountCounts>(() => ({
    ...this.loadedCounts(),
    wishlist: this.shopping.wishlistCount(),
    points: this.loyalty.balance(),
  }));
  readonly compactPoints = computed(() =>
    this.counts().points >= 100 ? '99+' : String(this.counts().points),
  );
  readonly navigation: readonly AccountNavItem[] = [
    {
      labelKey: 'CUSTOMER.ACCOUNT.NAV.PROFILE',
      icon: 'pi-user',
      path: 'profile',
    },
    {
      labelKey: 'CUSTOMER.ACCOUNT.NAV.ORDERS',
      icon: 'pi-shopping-bag',
      path: 'orders',
      badgeKey: 'orders',
    },
    {
      labelKey: 'CUSTOMER.ACCOUNT.NAV.POINTS',
      icon: 'pi-star',
      path: 'points',
      badgeKey: 'points',
    },
    {
      labelKey: 'CUSTOMER.ACCOUNT.NAV.WISHLIST',
      icon: 'pi-heart',
      path: 'wishlist',
      badgeKey: 'wishlist',
    },
    {
      labelKey: 'CUSTOMER.ACCOUNT.NAV.ADDRESSES',
      icon: 'pi-map-marker',
      path: 'addresses',
    },
    {
      labelKey: 'CUSTOMER.ACCOUNT.NAV.SETTINGS',
      icon: 'pi-cog',
      path: 'settings',
    },
  ];
  readonly email = computed(
    () => this.auth.user()?.email ?? this.auth.customerProfile()?.email ?? null,
  );

  constructor() {
    void this.loadCounts();
  }

  async logout(): Promise<void> {
    if (this.isLoggingOut()) return;
    this.isLoggingOut.set(true);

    try {
      await this.auth.logout();
    } catch (error) {
      this.toast.failed(
        'Logout',
        error instanceof Error ? error.message : 'Unable to sign out.',
      );
      this.isLoggingOut.set(false);
    }
  }

  private async loadCounts(): Promise<void> {
    const userId = await this.auth.getCurrentUserId();
    if (!userId) return;

    const [ordersCount, reviewsResult] = await Promise.all([
      this.customerOrders.getCustomerOrderCount().catch(() => 0),
      this.supabase
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

    this.loadedCounts.set({
      orders: ordersCount,
      reviews: reviewsResult.count ?? 0,
    });
  }
}
