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
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminPaginationComponent } from '../../../shared/ui/admin-pagination';
import { CustomerProductCardComponent } from '../components/customer-product-card';
import { CustomerProduct } from '../models';
import { CustomerShoppingStateService } from '../services';

@Component({
  selector: 'app-customer-wishlist',
  standalone: true,
  imports: [CustomerProductCardComponent, RouterLink, TranslatePipe, AdminPaginationComponent],
  templateUrl: './customer-wishlist.component.html',
  styleUrl: './customer-wishlist.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerWishlistComponent {
  readonly shopping = inject(CustomerShoppingStateService);
  private readonly wishlistGrid = viewChild<ElementRef<HTMLElement>>('wishlistGrid');

  readonly pageSize = 6;
  readonly currentPage = signal(1);
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

  changePage(page: number): void {
    this.currentPage.set(page);
    queueMicrotask(() => {
      const grid = this.wishlistGrid()?.nativeElement;
      grid?.focus({ preventScroll: true });
      grid?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}
