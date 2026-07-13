import { CustomerProduct } from './customer-product.model';

export type CustomerProductSort = 'featured' | 'newest' | 'price-low' | 'price-high' | 'rating';
export type CustomerProductView = 'grid' | 'list';

export interface CustomerPriceRange {
  label: string;
  value: string;
  min: number;
  max: number | null;
}

export interface CustomerProductBrowserState {
  products: CustomerProduct[];
  loading: boolean;
  error: string | null;
}

