import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CustomerAuthService } from '../../../core/services/auth';
import { ToastService } from '../../../core/services';
import { CustomerLoyaltyPointsBadgeComponent } from '../../../shared/components/customer-loyalty-points-badge';
import { AdminPaginationComponent } from '../../../shared/ui/admin-pagination';
import { CustomerProductCardComponent } from '../components/customer-product-card';
import { CustomerProduct } from '../models';
import { CustomerShoppingStateService, LoyaltyPointsCalculatorService } from '../services';

type WishlistViewMode = 'grid' | 'list';

@Component({
  selector: 'app-customer-wishlist',
  standalone: true,
  imports: [
    CurrencyPipe,
    CustomerLoyaltyPointsBadgeComponent,
    CustomerProductCardComponent,
    RouterLink,
    TranslatePipe,
    AdminPaginationComponent,
  ],
  templateUrl: './customer-wishlist.component.html',
  styleUrl: './customer-wishlist.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerWishlistComponent {
  readonly shopping = inject(CustomerShoppingStateService);
  readonly loyalty = inject(LoyaltyPointsCalculatorService);
  readonly customerAuth = inject(CustomerAuthService);

  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly wishlistGrid = viewChild<ElementRef<HTMLElement>>('wishlistGrid');

  readonly pageSize = 6;
  readonly currentPage = signal(1);
  readonly viewMode = signal<WishlistViewMode>('grid');
  readonly sharePending = signal(false);
  readonly starItems = [1, 2, 3, 4, 5];
  readonly totalPages = computed(() => Math.max(
    1,
    Math.ceil(this.shopping.wishlistProducts().length / this.pageSize),
  ));
  readonly safeCurrentPage = computed(() =>
    Math.min(this.currentPage(), this.totalPages()),
  );
  readonly paginatedProducts = computed(() => {
    const start = (this.safeCurrentPage() - 1) * this.pageSize;
    return this.shopping.wishlistProducts().slice(start, start + this.pageSize);
  });

  constructor() {
    effect(() => {
      const safePage = this.safeCurrentPage();
      if (this.currentPage() !== safePage) this.currentPage.set(safePage);
    });
    void this.shopping.ensureWishlistProducts();
  }

  async toggleWishlist(product: CustomerProduct): Promise<void> {
    await this.shopping.toggleWishlist(product);
  }

  async addToCart(product: CustomerProduct): Promise<void> {
    await this.shopping.addToCart(product);
  }

  updateCartQuantity(product: CustomerProduct, quantity: number): void {
    if (quantity <= 0) {
      void this.shopping.removeFromCart(product.id, product.variantId);
      return;
    }

    void this.shopping.setQuantity(product.id, quantity, product.variantId);
  }

  setViewMode(viewMode: WishlistViewMode): void {
    this.viewMode.set(viewMode);
  }

  isSoldOut(product: CustomerProduct): boolean {
    return product.stock <= 0 || !product.inStock;
  }

  isFilledStar(product: CustomerProduct, star: number): boolean {
    return star <= Math.round(product.rating);
  }

  hasDiscount(product: CustomerProduct): boolean {
    return typeof product.originalPrice === 'number' && product.originalPrice > product.price;
  }

  discountPercentage(product: CustomerProduct): number | null {
    if (!this.hasDiscount(product) || !product.originalPrice) {
      return null;
    }

    return Math.max(
      0,
      Math.min(100, Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)),
    );
  }

  loyaltyPoints(product: CustomerProduct): number {
    return this.loyalty.preview(product.price).pointsEarned;
  }

  async shareWishlist(): Promise<void> {
    const products = this.shopping.wishlistProducts();

    if (!products.length || this.sharePending()) {
      return;
    }

    this.sharePending.set(true);

    try {
      const title = this.translate.instant('CUSTOMER.WISHLIST.SHARE_TITLE');
      const text = this.buildShareText(products);

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({ title, text });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
        }
      }

      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        throw new Error('Clipboard API is unavailable.');
      }

      await navigator.clipboard.writeText(text);
      this.toast.success(this.translate.instant('CUSTOMER.WISHLIST.SHARE_COPIED'));
    } catch {
      this.toast.error(this.translate.instant('CUSTOMER.WISHLIST.SHARE_FAILED'));
    } finally {
      this.sharePending.set(false);
    }
  }

  changePage(page: number): void {
    this.currentPage.set(page);
    queueMicrotask(() => {
      const grid = this.wishlistGrid()?.nativeElement;
      grid?.focus({ preventScroll: true });
      grid?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  private buildShareText(products: readonly CustomerProduct[]): string {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const title = this.translate.instant('CUSTOMER.WISHLIST.SHARE_TITLE');
    const productLinks = products.map((product) => {
      const slug = encodeURIComponent(product.slug || product.id);
      return `${product.name}: ${origin}/shop/products/${slug}`;
    });

    return [title, ...productLinks].join('\n');
  }
}
