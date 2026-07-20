import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CustomerProductCardComponent } from '../../components/customer-product-card';
import { CustomerProductFiltersComponent } from '../../components/customer-product-filters';
import { CustomerProductQuickViewComponent } from '../../components/customer-product-quick-view';
import { NewArrivalsService } from '../../services';
import { ProductBrowserPage } from '../product-browser-page';
import { CustomerProductCardSkeleton } from '../../components/customer-product-card-skeleton/customer-product-card-skeleton';

@Component({
  selector: 'app-all-products', standalone: true,
  imports: [CdkTrapFocus, CustomerProductCardComponent, CustomerProductFiltersComponent, CustomerProductCardSkeleton, CustomerProductQuickViewComponent, RouterLink, TranslatePipe],
  templateUrl: './all-products.html', styleUrl: './all-products.css',
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
      this.slugify(selected[0]) === requestedCategorySlug
      ? selected[0]
      : this.titleKey;
  });
  private readonly catalog = inject(NewArrivalsService);
  private readonly route = inject(ActivatedRoute);
  private readonly requestedCategorySlug = signal<string | null>(null);
  private readonly navigationSource = signal<string | null>(null);

  constructor() {
    super();
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.requestedCategorySlug.set(params.get('category'));
      this.navigationSource.set(params.get('source'));
      this.applyRouteCategory();
      this.closeMobileFilters();
    });
    void this.load();
  }

  @HostListener('document:keydown.escape')
  closePanelsOnEscape(): void {
    this.closeMobileFilters();
  }
  private async load(): Promise<void> {
    try {
      this.products.set(await this.catalog.getProducts());
      this.applyRouteCategory();
    }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'Unable to load products.'); }
    finally { this.loading.set(false); }
  }

  private applyRouteCategory(): void {
    const requestedCategorySlug = this.requestedCategorySlug();
    if (!requestedCategorySlug || !this.products().length) {
      if (!requestedCategorySlug) this.selectedCategories.set([]);
      return;
    }

    const category = this.categoryOptions().find(
      (option) => this.slugify(option.value) === requestedCategorySlug,
    );
    this.selectedCategories.set(category ? [category.value] : []);
  }

  private slugify(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
}
