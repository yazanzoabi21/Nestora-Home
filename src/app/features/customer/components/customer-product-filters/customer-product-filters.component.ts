import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export interface CustomerFilterOption {
  label: string;
  value: string;
  icon?: string;
}

export interface CustomerRatingFilterOption {
  label: string;
  value: number;
}

@Component({
  selector: 'app-customer-product-filters',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './customer-product-filters.component.html',
  styleUrl: './customer-product-filters.component.css',
})
export class CustomerProductFiltersComponent {
  readonly categories = input.required<CustomerFilterOption[]>();
  readonly priceRanges = input.required<CustomerFilterOption[]>();
  readonly ratings = input.required<CustomerRatingFilterOption[]>();

  readonly selectedCategories = input<string[]>([]);
  readonly selectedPriceRange = input<string | null>(null);
  readonly selectedRating = input<number | null>(null);
  readonly inStockOnly = input(false);

  readonly categoryToggle = output<string>();
  readonly priceRangeChange = output<string | null>();
  readonly ratingChange = output<number | null>();
  readonly inStockOnlyChange = output<boolean>();
  readonly clearFilters = output<void>();

  isCategorySelected(category: string): boolean {
    return this.selectedCategories().includes(category);
  }

  isPriceRangeSelected(priceRange: string): boolean {
    return this.selectedPriceRange() === priceRange;
  }

  isRatingSelected(rating: number): boolean {
    return this.selectedRating() === rating;
  }
}

