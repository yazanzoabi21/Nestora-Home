import { computed, inject, signal } from '@angular/core';
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

export abstract class ProductBrowserPage {
  abstract readonly titleKey: string;

  readonly pageTitle = computed(() => this.titleKey);
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
  readonly visibleProducts = computed(() => {
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
    switch (this.sortBy()) {
      case 'newest':
        return filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      case 'price-low':
        return filtered.sort((a, b) => a.price - b.price);
      case 'price-high':
        return filtered.sort((a, b) => b.price - a.price);
      case 'rating':
        return filtered.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
      default:
        return filtered.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
    }
  });
  readonly productCountLabel = computed(
    () =>
      `${this.visibleProducts().length} ${this.visibleProducts().length === 1 ? 'product' : 'products'}`,
  );

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
}
