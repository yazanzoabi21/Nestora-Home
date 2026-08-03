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
}

export interface CustomerProductDetails extends CustomerProduct {
  longDescription?: string;
  gallery: string[];
  sku?: string | null;
  features: string[];
}
