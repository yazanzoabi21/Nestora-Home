import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { PromotionSelectableProduct } from '../../../../data-access';
import { AdminPaginationComponent, PaginationPageSize } from '../../../../shared/ui/admin-pagination';

type ProductPickerView = 'all' | 'selected';

interface ProductPickerCategory {
  label: string;
  value: string;
}

@Component({
  selector: 'app-promotion-product-picker',
  standalone: true,
  imports: [AdminPaginationComponent, CurrencyPipe, TranslatePipe],
  templateUrl: './promotion-product-picker.component.html',
  styleUrl: './promotion-product-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromotionProductPickerComponent {
  readonly isOpen = input(false);
  readonly products = input<PromotionSelectableProduct[]>([]);
  readonly selectedProductIds = input<string[]>([]);

  readonly dismissed = output<void>();
  readonly applied = output<string[]>();

  readonly searchTerm = signal('');
  readonly selectedCategory = signal('all');
  readonly view = signal<ProductPickerView>('all');
  readonly page = signal(1);
  readonly pageSize = signal<PaginationPageSize>(12);
  readonly temporarySelectedProductIds = signal<string[]>([]);

  private wasOpen = false;

  readonly selectedIdSet = computed(() => new Set(this.temporarySelectedProductIds()));

  readonly categories = computed<ProductPickerCategory[]>(() => {
    const categories = new Map<string, string>();

    for (const product of this.products()) {
      const value = this.categoryValue(product);
      if (value && product.category_name) {
        categories.set(value, product.category_name);
      }
    }

    return [...categories.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((first, second) => first.label.localeCompare(second.label));
  });

  readonly filteredProducts = computed(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const category = this.selectedCategory();
    const selectedOnly = this.view() === 'selected';
    const selectedIds = this.selectedIdSet();

    return this.products().filter((product) => {
      const matchesSearch =
        !searchTerm ||
        product.name.toLowerCase().includes(searchTerm) ||
        (product.sku ?? '').toLowerCase().includes(searchTerm);
      const matchesCategory = category === 'all' || this.categoryValue(product) === category;
      const matchesSelection = !selectedOnly || selectedIds.has(product.id);

      return matchesSearch && matchesCategory && matchesSelection;
    });
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredProducts().length / this.safePageSize())),
  );

  readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));

  readonly paginatedProducts = computed(() => {
    if (this.pageSize() === 'all') return this.filteredProducts();
    const start = (this.currentPage() - 1) * this.safePageSize();
    return this.filteredProducts().slice(start, start + this.safePageSize());
  });

  readonly visibleRangeStart = computed(() =>
    this.filteredProducts().length === 0 ? 0 : (this.currentPage() - 1) * this.safePageSize() + 1,
  );

  readonly visibleRangeEnd = computed(() =>
    Math.min(this.currentPage() * this.safePageSize(), this.filteredProducts().length),
  );
  readonly showPagination = computed(() => {
    const pageSize = this.pageSize();
    return pageSize === 'all' || this.filteredProducts().length > pageSize;
  });

  constructor() {
    effect(() => {
      const isOpen = this.isOpen();
      const selectedProductIds = this.selectedProductIds();

      if (isOpen && !this.wasOpen) {
        this.temporarySelectedProductIds.set([...selectedProductIds]);
        this.resetFilters();
      }

      this.wasOpen = isOpen;
    });
  }

  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
    this.page.set(1);
  }

  setCategory(value: string): void {
    this.selectedCategory.set(value);
    this.page.set(1);
  }

  setView(view: ProductPickerView): void {
    this.view.set(view);
    this.page.set(1);
  }

  isSelected(productId: string): boolean {
    return this.selectedIdSet().has(productId);
  }

  toggleProduct(productId: string): void {
    this.temporarySelectedProductIds.update((currentIds) =>
      currentIds.includes(productId)
        ? currentIds.filter((id) => id !== productId)
        : [...currentIds, productId],
    );
  }

  clearSelection(): void {
    this.temporarySelectedProductIds.set([]);
    this.page.set(1);
  }

  setPage(page: number): void {
    this.page.set(page);
  }

  setPageSize(pageSize: PaginationPageSize): void {
    this.pageSize.set(pageSize);
    this.page.set(1);
  }

  displayPrice(product: PromotionSelectableProduct): number {
    return product.sale_price !== null && product.sale_price < product.price
      ? product.sale_price
      : product.price;
  }

  cancel(): void {
    this.dismissed.emit();
  }

  apply(): void {
    this.applied.emit([...this.temporarySelectedProductIds()]);
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }

  private resetFilters(): void {
    this.searchTerm.set('');
    this.selectedCategory.set('all');
    this.view.set('all');
    this.page.set(1);
  }

  private safePageSize(): number {
    const pageSize = this.pageSize();
    return pageSize === 'all' ? Math.max(this.filteredProducts().length, 1) : pageSize;
  }

  private categoryValue(product: PromotionSelectableProduct): string | null {
    return product.category_id ?? product.category_name;
  }
}
