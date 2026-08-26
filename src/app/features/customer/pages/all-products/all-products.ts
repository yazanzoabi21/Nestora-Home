import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  effect,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { FormsModule } from '@angular/forms';
import { CustomerProductCardComponent } from '../../components/customer-product-card';
import { CustomerProductFiltersComponent } from '../../components/customer-product-filters';
import { CustomerProductQuickViewComponent } from '../../components/customer-product-quick-view';
import { CustomerCatalogService } from '../../services';
import { ProductBrowserPage } from '../product-browser-page';
import { CustomerProductCardSkeleton } from '../../components/customer-product-card-skeleton/customer-product-card-skeleton';
import { AdminPaginationComponent } from '../../../../shared/ui/admin-pagination';

@Component({
  selector: 'app-all-products',
  standalone: true,
  imports: [
    CdkTrapFocus,
    FormsModule,
    CustomerProductCardComponent,
    CustomerProductFiltersComponent,
    CustomerProductCardSkeleton,
    CustomerProductQuickViewComponent,
    RouterLink,
    TranslatePipe,
    AdminPaginationComponent,
  ],
  templateUrl: './all-products.html',
  styleUrl: './all-products.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllProducts extends ProductBrowserPage {
  override readonly titleKey = 'CUSTOMER.PRODUCTS.ALL_PRODUCTS';
  override readonly pageTitle = computed(() => {
    const selected = this.selectedCategories();
    const requestedCategorySlug = this.requestedCategorySlug();
    return this.navigationSource() === 'navbar' &&
      requestedCategorySlug &&
      selected.length === 1 &&
      this.slugify(selected[0]) === this.slugify(requestedCategorySlug)
      ? selected[0]
      : this.titleKey;
  });
  private readonly catalog = inject(CustomerCatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly routeNavigator = inject(Router);
  private readonly requestedCategorySlug = signal<string | null>(null);
  private readonly navigationSource = signal<string | null>(null);

  constructor() {
    super();
    effect(() => {
      const requestedCategorySlug = this.requestedCategorySlug();
      const availableCategories = this.categoryOptions();

      if (requestedCategorySlug && availableCategories.length) {
        this.applyRouteCategory();
      }
    });
    effect(() => {
      const products = this.catalog.productsSnapshot();
      if (!products) return;

      this.replaceProducts(products);
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.requestedCategorySlug.set(params.get('category'));
      this.navigationSource.set(params.get('source'));
      this.setProductSearch(params.get('search') ?? '');
      this.applyRouteCategory();
      this.closeMobileFilters();
    });
    void this.load();
  }

  @HostListener('document:keydown.escape')
  closePanelsOnEscape(): void {
    this.closeMobileFilters();
  }

  override clearFilters(): void {
    super.clearFilters();

    this.setProductSearch('');
    this.requestedCategorySlug.set(null);
    this.navigationSource.set(null);

    void this.routeNavigator.navigate([], {
      relativeTo: this.route,
      queryParams: {
        category: null,
        source: null,
        search: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  clearProductSearch(): void {
    this.setProductSearch('');
    void this.routeNavigator.navigate([], {
      relativeTo: this.route,
      queryParams: { search: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  private async load(): Promise<void> {
    try {
      this.replaceProducts(await this.catalog.getProducts());
      this.applyRouteCategory();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load products.');
    } finally {
      this.loading.set(false);
    }
  }

  private applyRouteCategory(): void {
    const requestedCategorySlug = this.requestedCategorySlug();
    if (!requestedCategorySlug || !this.products().length) {
      if (!requestedCategorySlug) this.selectedCategories.set([]);
      return;
    }

    const normalizedRequestedCategorySlug = this.slugify(requestedCategorySlug);

    const category = this.filterCategories().find(
      (option) => this.slugify(option.slug) === normalizedRequestedCategorySlug,
    );
    const nextSelection = category ? [category.name] : [];
    if (this.selectedCategories()[0] !== nextSelection[0]) {
      this.selectedCategories.set(nextSelection);
      this.resetPagination();
    }
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
