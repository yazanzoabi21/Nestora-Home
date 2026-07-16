import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CustomerAuthService } from '../../../../core/services/auth';
import { CUSTOMER_SUPABASE } from '../../../../core/tokens';
import { CustomerShoppingStateService } from '../../services';
import { ToastService } from '../../../../core/services/toast.service';

interface AccountNavItem { label: string; icon: string; path: string; }
interface AccountCounts { orders: number; wishlist: number; reviews: number; }

@Component({
  selector: 'app-customer-account', standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './customer-account.component.html', styleUrl: './customer-account.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerAccountComponent {
  readonly auth = inject(CustomerAuthService);
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly shopping = inject(CustomerShoppingStateService);
  private readonly toast = inject(ToastService);
  readonly isLoggingOut = signal(false);
  readonly counts = signal<AccountCounts>({ orders: 0, wishlist: 0, reviews: 0 });
  readonly navigation: AccountNavItem[] = [
    { label: 'My Profile', icon: 'pi-user', path: 'profile' },
    { label: 'Orders', icon: 'pi-shopping-bag', path: 'orders' },
    { label: 'Wishlist', icon: 'pi-heart', path: 'wishlist' },
    { label: 'Addresses', icon: 'pi-map-marker', path: 'addresses' },
    { label: 'Settings', icon: 'pi-cog', path: 'settings' },
  ];
  readonly email = computed(() => this.auth.user()?.email ?? this.auth.customerProfile()?.email ?? 'Not provided');

  constructor() { void this.loadCounts(); }

  async logout(): Promise<void> {
    if (this.isLoggingOut()) return;
    this.isLoggingOut.set(true);
    try {
      await this.auth.logout();
    } catch (error) {
      this.toast.failed('Logout', error instanceof Error ? error.message : 'Unable to sign out.');
      this.isLoggingOut.set(false);
    }
  }

  private async loadCounts(): Promise<void> {
    const userId = await this.auth.getCurrentUserId();
    if (!userId) return;
    const [orders, reviews] = await Promise.all([
      this.supabase.from('orders').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      this.supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    this.counts.set({ orders: orders.count ?? 0, reviews: reviews.count ?? 0, wishlist: this.shopping.wishlistIds().size });
  }
}
