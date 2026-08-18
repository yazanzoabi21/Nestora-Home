export interface CustomerProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  imageUrl: string;
  description?: string;
  price: number;
  originalPrice?: number | null;
  rating: number;
  reviewCount: number;
  discountPercentage?: number | null;
  badge?: 'Best Seller' | 'New' | null;
  isFeatured: boolean;
  isNew: boolean;
  isActive: boolean;
  isLoyaltyEligible: boolean;
  soldCount: number;
  inStock: boolean;
  stock: number;
  createdAt?: string | null;
  slug?: string | null;
  sku?: string | null;
  variantId?: string | null;
  variantLabel?: string | null;
  variantOptionName?: string | null;
  variantOptionValue?: string | null;
  variantAttributes?: Readonly<Record<string, string>>;
}

export interface CustomerProductDetails extends CustomerProduct {
  longDescription?: string;
  gallery: string[];
  sku?: string | null;
  features: string[];
  variants: CustomerProductVariant[];
}

export interface CustomerProductVariant {
  id: string;
  optionName: string;
  optionValue: string;
  name: string | null;
  sku: string | null;
  price: number | null;
  salePrice: number | null;
  stock: number | null;
  attributes: Readonly<Record<string, string>>;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}
