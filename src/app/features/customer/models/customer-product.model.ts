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
  inStock: boolean;
  stock: number;
}

