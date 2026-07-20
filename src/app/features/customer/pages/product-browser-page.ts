import { DOCUMENT } from '@angular/common';
import { DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import {
  CustomerFilterOption,
  CustomerRatingFilterOption,
} from '../components/customer-product-filters';
import {
  CustomerPriceRange,
  CustomerProduct,
  CustomerProductSort,
  CustomerProductView,
} from '../models';
import { CustomerShoppingStateService } from '../services';

type ActiveFilterChip =
  | { kind: 'category'; label: string; value: string }
  | { kind: 'price'; label: string; value: string }
  | { kind: 'rating'; label: string; value: number }
  | { kind: 'stock'; label: string; value: true };

export abstract class ProductBrowserPage {
  abstract readonly titleKey: string;

  readonly filtersEnabled: boolean = true;
  readonly pageTitle = computed(() => this.titleKey);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  readonly shopping = inject(CustomerShoppingStateService);
  readonly products = signal<CustomerProduct[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly selectedCategories = signal<string[]>([]);
  readonly selectedPriceRange = signal<string | null>(null);
  readonly selectedRating = signal<number | null>(null);
  readonly inStockOnly = signal(false);
  readonly sortBy = signal<CustomerProductSort>('featured');
  readonly viewMode = signal<CustomerProductView>('grid');
  readonly mobileFiltersOpen = signal(false);
  readonly wishlistProductIds = this.shopping.wishlistIds;
  readonly selectedProduct = signal<CustomerProduct | null>(null);
  readonly cartCount = signal(0);

  readonly priceRanges: CustomerPriceRange[] = [
    { label: 'Under $30', value: 'under-30', min: 0, max: 30 },
    { label: '$30 - $60', value: '30-60', min: 30, max: 60 },
    { label: '$60 - $100', value: '60-100', min: 60, max: 100 },
    { label: 'Over $100', value: 'over-100', min: 100, max: null },
  ];
  readonly ratingOptions: CustomerRatingFilterOption[] = [
    { label: '★★★★★ & up', value: 5 },
    { label: '★★★★☆ & up', value: 4 },
    { label: '★★★☆☆ & up', value: 3 },
  ];
  readonly sortOptions: { label: string; value: CustomerProductSort }[] = [
    { label: 'Featured', value: 'featured' },
    { label: 'Newest', value: 'newest' },
    { label: 'Price: Low to High', value: 'price-low' },
    { label: 'Price: High to Low', value: 'price-high' },
    { label: 'Highest Rated', value: 'rating' },
  ];
  readonly categoryOptions = computed<CustomerFilterOption[]>(() =>
    [...new Set(this.products().map((product) => product.category))]
      .sort()
      .map((label) => ({ label, value: label })),
  );
  readonly activePriceRange = computed(
    () => this.priceRanges.find((range) => range.value === this.selectedPriceRange()) ?? null,
  );
  readonly activeFilterChips = computed<ActiveFilterChip[]>(() => {
    if (!this.filtersEnabled) {
      return [];
    }

    const chips: ActiveFilterChip[] = this.selectedCategories().map((category) => ({
      kind: 'category',
      label: category,
      value: category,
    }));
    const activePriceRange = this.activePriceRange();
    if (activePriceRange) {
      chips.push({ kind: 'price', label: activePriceRange.label, value: activePriceRange.value });
    }
    const activeRating = this.ratingOptions.find((rating) => rating.value === this.selectedRating());
    if (activeRating) {
      chips.push({ kind: 'rating', label: activeRating.label, value: activeRating.value });
    }
    if (this.inStockOnly()) {
      chips.push({ kind: 'stock', label: 'In Stock', value: true });
    }
    return chips;
  });
  readonly activeFilterCount = computed(() => this.activeFilterChips().length);
  readonly visibleProducts = computed(() => {
    if (!this.filtersEnabled) {
      return this.sortProducts([...this.products()]);
    }

    const range = this.activePriceRange();
    const filtered = this.products().filter(
      (product) =>
        (!this.selectedCategories().length ||
          this.selectedCategories().includes(product.category)) &&
        (!range ||
          (product.price >= range.min && (range.max === null || product.price < range.max))) &&
        (this.selectedRating() === null || product.rating >= this.selectedRating()!) &&
        (!this.inStockOnly() || product.inStock),
    );
    return this.sortProducts(filtered);
  });
  readonly productCountLabel = computed(
    () =>
      `${this.visibleProducts().length} ${this.visibleProducts().length === 1 ? 'product' : 'products'}`,
  );
  private scrollLockState: { scrollY: number; previousBodyStyle: Partial<CSSStyleDeclaration> } | null =
    null;
  private filterTrigger: HTMLElement | null = null;

  constructor() {
    effect((onCleanup) => {
      if (!this.mobileFiltersOpen()) {
        return;
      }

      this.lockPageScroll();
      window.setTimeout(() => this.focusFilterDrawer(), 0);
      onCleanup(() => this.unlockPageScroll());
    });

    this.destroyRef.onDestroy(() => this.unlockPageScroll());
    this.router.events
      .pipe(
        filter((event): event is NavigationStart => event instanceof NavigationStart),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.closeMobileFilters());
  }

  openMobileFilters(trigger?: HTMLElement): void {
    if (!this.filtersEnabled) {
      return;
    }

    this.filterTrigger =
      trigger ?? (this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null);
    this.mobileFiltersOpen.set(true);
  }

  closeMobileFilters(): void {
    if (!this.mobileFiltersOpen()) {
      return;
    }
    this.mobileFiltersOpen.set(false);
    window.setTimeout(() => this.filterTrigger?.focus(), 0);
  }

  toggleCategory(value: string): void {
    this.selectedCategories.update((items) =>
      items.includes(value) ? items.filter((item) => item !== value) : [...items, value],
    );
  }
  setPriceRange(value: string | null): void {
    this.selectedPriceRange.set(this.selectedPriceRange() === value ? null : value);
  }
  setRating(value: number | null): void {
    this.selectedRating.set(this.selectedRating() === value ? null : value);
  }
  clearFilters(): void {
    this.selectedCategories.set([]);
    this.selectedPriceRange.set(null);
    this.selectedRating.set(null);
    this.inStockOnly.set(false);
  }
  removeActiveFilter(chip: ActiveFilterChip): void {
    switch (chip.kind) {
      case 'category':
        this.selectedCategories.update((items) => items.filter((item) => item !== chip.value));
        break;
      case 'price':
        this.selectedPriceRange.set(null);
        break;
      case 'rating':
        this.selectedRating.set(null);
        break;
      case 'stock':
        this.inStockOnly.set(false);
        break;
    }
  }
  toggleWishlist(product: CustomerProduct): void {
    this.shopping.toggleWishlist(product.id);
  }
  isWishlisted(id: string): boolean {
    return this.wishlistProductIds().has(id);
  }
  selectProduct(product: CustomerProduct): void {
    this.selectedProduct.set(product);
  }
  closeQuickView(): void {
    this.selectedProduct.set(null);
  }
  isSelected(id: string): boolean {
    return this.selectedProduct()?.id === id;
  }
  isAddingToCart(id: string): boolean {
    return this.shopping.pendingProductIds().has(id);
  }
  addProductToCart(product: CustomerProduct, quantity = 1): void {
    void this.shopping.addToCart(product, quantity);
  }

  private lockPageScroll(): void {
    if (this.scrollLockState) {
      return;
    }

    const body = this.document.body;
    const scrollY = window.scrollY;
    this.scrollLockState = {
      scrollY,
      previousBodyStyle: {
        overflow: body.style.overflow,
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
      },
    };
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
  }

  private unlockPageScroll(): void {
    if (!this.scrollLockState) {
      return;
    }

    const body = this.document.body;
    const { scrollY, previousBodyStyle } = this.scrollLockState;
    body.style.overflow = previousBodyStyle.overflow ?? '';
    body.style.position = previousBodyStyle.position ?? '';
    body.style.top = previousBodyStyle.top ?? '';
    body.style.width = previousBodyStyle.width ?? '';
    this.scrollLockState = null;
    window.scrollTo(0, scrollY);
  }

  private focusFilterDrawer(): void {
    this.document.getElementById('customer-mobile-filter-close')?.focus();
  }

  private sortProducts(products: CustomerProduct[]): CustomerProduct[] {
    switch (this.sortBy()) {
      case 'newest':
        return products.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      case 'price-low':
        return products.sort((a, b) => a.price - b.price);
      case 'price-high':
        return products.sort((a, b) => b.price - a.price);
      case 'rating':
        return products.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
      default:
        return products.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
    }
  }
}
