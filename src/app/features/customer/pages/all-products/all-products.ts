import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  CustomerFilterOption,
  CustomerProductFiltersComponent,
  CustomerRatingFilterOption,
} from '../../components/customer-product-filters';
import {
  CustomerProductCardComponent,
  CustomerProductCardView,
} from '../../components/customer-product-card';
import { CustomerProductQuickViewComponent } from '../../components/customer-product-quick-view';
import { CustomerProduct } from '../../models';

type ProductSort = 'featured' | 'newest' | 'price-low' | 'price-high' | 'rating';

interface PriceRange {
  label: string;
  value: string;
  min: number;
  max: number | null;
}

@Component({
  selector: 'app-all-products',
  standalone: true,
  imports: [
    CustomerProductCardComponent,
    CustomerProductFiltersComponent,
    CustomerProductQuickViewComponent,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: './all-products.html',
  styleUrl: './all-products.css',
})
export class AllProducts {
  readonly products: CustomerProduct[] = [
    {
      id: 'pro-electric-kettle',
      name: 'Pro Electric Kettle 1.7L',
      brand: 'Nestora',
      category: 'Kitchen Tools',
      imageUrl: 'https://images.unsplash.com/photo-1594213114663-d94db9b17125?auto=format&fit=crop&w=900&q=85',
      description: 'Fast-boil matte kettle with precise temperature control and a quiet daily profile.',
      price: 49.99,
      originalPrice: 69.99,
      rating: 5,
      reviewCount: 234,
      discountPercentage: 29,
      badge: 'Best Seller',
      isFeatured: true,
      isNew: false,
      inStock: true,
      stock: 42,
    },
    {
      id: 'acacia-cutting-board',
      name: 'Acacia Wood Cutting Board',
      brand: 'Nestora',
      category: 'Kitchen Tools',
      imageUrl: 'https://images.unsplash.com/photo-1593618998160-e34014e67546?auto=format&fit=crop&w=900&q=85',
      description: 'Durable acacia board with a smooth prep surface and handsome natural grain.',
      price: 34.99,
      originalPrice: 44.99,
      rating: 5,
      reviewCount: 412,
      discountPercentage: 22,
      badge: 'Best Seller',
      isFeatured: true,
      isNew: false,
      inStock: true,
      stock: 65,
    },
    {
      id: 'cast-iron-skillet',
      name: 'Cast Iron Skillet 10"',
      brand: 'Nestora',
      category: 'Cookware',
      imageUrl: 'https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=900&q=85',
      description: 'Pre-seasoned skillet for high-heat searing, baking, and everyday stovetop cooking.',
      price: 59.99,
      originalPrice: 79.99,
      rating: 5,
      reviewCount: 567,
      discountPercentage: 25,
      badge: 'Best Seller',
      isFeatured: true,
      isNew: false,
      inStock: true,
      stock: 31,
    },
    {
      id: 'signature-coffee-maker',
      name: 'Signature Coffee Maker',
      brand: 'Nestora',
      category: 'Kitchen Tools',
      imageUrl: 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?auto=format&fit=crop&w=900&q=85',
      description: 'Compact programmable coffee maker with a clean counter-friendly silhouette.',
      price: 89.99,
      originalPrice: 119.99,
      rating: 5,
      reviewCount: 198,
      discountPercentage: 25,
      badge: 'New',
      isFeatured: false,
      isNew: true,
      inStock: true,
      stock: 18,
    },
    {
      id: 'bamboo-organizer-set',
      name: 'Bamboo Drawer Organizer Set',
      brand: 'Nestora',
      category: 'Kitchen Tools',
      imageUrl: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=900&q=85',
      description: 'Stackable bamboo organizers for utensils, tea, spices, and small home essentials.',
      price: 29.99,
      originalPrice: null,
      rating: 5,
      reviewCount: 143,
      discountPercentage: null,
      badge: 'New',
      isFeatured: false,
      isNew: true,
      inStock: true,
      stock: 77,
    },
    {
      id: 'stainless-mixing-bowl',
      name: 'Stainless Steel Mixing Bowl Set',
      brand: 'Nestora',
      category: 'Cookware',
      imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=85',
      description: 'Nested stainless bowls with stable bases for prep, baking, and serving.',
      price: 42.99,
      originalPrice: 54.99,
      rating: 5,
      reviewCount: 321,
      discountPercentage: 22,
      badge: 'Best Seller',
      isFeatured: true,
      isNew: false,
      inStock: true,
      stock: 40,
    },
    {
      id: 'professional-knife-set',
      name: 'Professional 6-Piece Knife Set',
      brand: 'Nestora',
      category: 'Kitchen Tools',
      imageUrl: 'https://images.unsplash.com/photo-1593618998160-e34014e67546?auto=format&fit=crop&w=900&q=85',
      description: 'Balanced stainless knives with a storage block for confident daily prep.',
      price: 119.99,
      originalPrice: 159.99,
      rating: 5,
      reviewCount: 489,
      discountPercentage: 25,
      badge: 'Best Seller',
      isFeatured: true,
      isNew: false,
      inStock: true,
      stock: 24,
    },
    {
      id: 'smart-robot-vacuum',
      name: 'Smart Robot Vacuum',
      brand: 'Nestora',
      category: 'Smart Tools',
      imageUrl: 'https://images.unsplash.com/photo-1603618090561-412154b4bd1b?auto=format&fit=crop&w=900&q=85',
      description: 'Low-profile robot vacuum with smart mapping for quiet, automatic cleaning.',
      price: 249.99,
      originalPrice: 329.99,
      rating: 5,
      reviewCount: 167,
      discountPercentage: 24,
      badge: 'New',
      isFeatured: false,
      isNew: true,
      inStock: true,
      stock: 12,
    },
    {
      id: 'smart-air-purifier',
      name: 'Smart Air Purifier',
      brand: 'Nestora',
      category: 'Smart Tools',
      imageUrl: 'https://images.unsplash.com/photo-1603618090561-412154b4bd1b?auto=format&fit=crop&w=900&q=85',
      description: 'Minimal purifier with app scheduling and multi-stage filtration for bedrooms.',
      price: 179.99,
      originalPrice: 229.99,
      rating: 5,
      reviewCount: 203,
      discountPercentage: 22,
      badge: null,
      isFeatured: false,
      isNew: false,
      inStock: true,
      stock: 21,
    },
    {
      id: 'ceramic-cookware-set',
      name: 'Ceramic Non-Stick Cookware Set',
      brand: 'Nestora',
      category: 'Cookware',
      imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&q=85',
      description: 'Ceramic-coated cookware set with stay-cool handles and easy-clean interiors.',
      price: 149.99,
      originalPrice: 199.99,
      rating: 5,
      reviewCount: 356,
      discountPercentage: 25,
      badge: 'Best Seller',
      isFeatured: true,
      isNew: false,
      inStock: true,
      stock: 9,
    },
    {
      id: 'eco-cleaning-bundle',
      name: 'Eco Cleaning Bundle',
      brand: 'Nestora',
      category: 'Cleaning',
      imageUrl: 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=900&q=85',
      description: 'Reusable, low-waste cleaning set for kitchens, baths, and everyday spills.',
      price: 39.99,
      originalPrice: 54.99,
      rating: 5,
      reviewCount: 128,
      discountPercentage: 27,
      badge: 'New',
      isFeatured: false,
      isNew: true,
      inStock: true,
      stock: 84,
    },
    {
      id: 'dutch-oven',
      name: 'Dutch Oven 5.5 Qt',
      brand: 'Nestora',
      category: 'Cookware',
      imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&q=85',
      description: 'Heavy-duty Dutch oven for braising, soups, sourdough, and slow weekend meals.',
      price: 94.99,
      originalPrice: 124.99,
      rating: 5,
      reviewCount: 432,
      discountPercentage: 24,
      badge: 'Best Seller',
      isFeatured: true,
      isNew: false,
      inStock: true,
      stock: 16,
    },
  ];

  readonly categoryOptions: CustomerFilterOption[] = [
    { label: 'Kitchen Tools', value: 'Kitchen Tools', icon: 'pi pi-search' },
    { label: 'Cookware', value: 'Cookware', icon: 'pi pi-circle-fill' },
    { label: 'Cleaning', value: 'Cleaning', icon: 'pi pi-sparkles' },
    { label: 'Smart Tools', value: 'Smart Tools', icon: 'pi pi-bolt' },
  ];

  readonly priceRanges: PriceRange[] = [
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

  readonly sortOptions: { label: string; value: ProductSort }[] = [
    { label: 'Featured', value: 'featured' },
    { label: 'Newest', value: 'newest' },
    { label: 'Price: Low to High', value: 'price-low' },
    { label: 'Price: High to Low', value: 'price-high' },
    { label: 'Highest Rated', value: 'rating' },
  ];

  readonly selectedCategories = signal<string[]>([]);
  readonly selectedPriceRange = signal<string | null>(null);
  readonly selectedRating = signal<number | null>(null);
  readonly inStockOnly = signal(false);
  readonly sortBy = signal<ProductSort>('featured');
  readonly viewMode = signal<CustomerProductCardView>('grid');
  readonly mobileFiltersOpen = signal(false);
  readonly wishlistProductIds = signal<Set<string>>(new Set());
  readonly cartCount = signal(0);
  readonly selectedProduct = signal<CustomerProduct | null>(null);

  readonly filteredProducts = computed(() => {
    const categories = this.selectedCategories();
    const priceRange = this.activePriceRange();
    const rating = this.selectedRating();
    const inStockOnly = this.inStockOnly();

    return this.products.filter((product) => {
      const matchesCategory = categories.length === 0 || categories.includes(product.category);
      const matchesPrice =
        !priceRange ||
        (product.price >= priceRange.min && (priceRange.max === null || product.price < priceRange.max));
      const matchesRating = rating === null || product.rating >= rating;
      const matchesStock = !inStockOnly || product.inStock;

      return matchesCategory && matchesPrice && matchesRating && matchesStock;
    });
  });

  readonly visibleProducts = computed(() => {
    const products = [...this.filteredProducts()];

    switch (this.sortBy()) {
      case 'newest':
        return products.sort((a, b) => Number(b.isNew) - Number(a.isNew));
      case 'price-low':
        return products.sort((a, b) => a.price - b.price);
      case 'price-high':
        return products.sort((a, b) => b.price - a.price);
      case 'rating':
        return products.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
      case 'featured':
      default:
        return products.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
    }
  });

  readonly productCountLabel = computed(() => {
    const count = this.visibleProducts().length;
    return count === 1 ? '1 product' : `${count} products`;
  });

  readonly activePriceRange = computed(() => {
    const selected = this.selectedPriceRange();
    return this.priceRanges.find((range) => range.value === selected) ?? null;
  });

  toggleCategory(category: string): void {
    const selected = this.selectedCategories();
    this.selectedCategories.set(
      selected.includes(category) ? selected.filter((item) => item !== category) : [...selected, category]
    );
  }

  setPriceRange(priceRange: string | null): void {
    this.selectedPriceRange.set(this.selectedPriceRange() === priceRange ? null : priceRange);
  }

  setRating(rating: number | null): void {
    this.selectedRating.set(this.selectedRating() === rating ? null : rating);
  }

  setSort(value: string): void {
    if (this.isProductSort(value)) {
      this.sortBy.set(value);
    }
  }

  setViewMode(viewMode: CustomerProductCardView): void {
    this.viewMode.set(viewMode);
  }

  clearFilters(): void {
    this.selectedCategories.set([]);
    this.selectedPriceRange.set(null);
    this.selectedRating.set(null);
    this.inStockOnly.set(false);
  }

  toggleWishlist(product: CustomerProduct): void {
    const next = new Set(this.wishlistProductIds());

    if (next.has(product.id)) {
      next.delete(product.id);
    } else {
      next.add(product.id);
    }

    this.wishlistProductIds.set(next);
  }

  isWishlisted(productId: string): boolean {
    return this.wishlistProductIds().has(productId);
  }

  addProductToCart(product: CustomerProduct): void {
    if (!product.inStock) {
      return;
    }

    this.cartCount.update((count) => count + 1);
  }

  selectProduct(product: CustomerProduct): void {
    this.selectedProduct.set(product);
  }

  closeQuickView(): void {
    this.selectedProduct.set(null);
  }

  isSelected(productId: string): boolean {
    return this.selectedProduct()?.id === productId;
  }

  private isProductSort(value: string): value is ProductSort {
    return this.sortOptions.some((option) => option.value === value);
  }
}
