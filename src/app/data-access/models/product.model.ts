export type ProductStatus = 'in_stock' | 'low_stock' | 'out_of_stock';
export type ProductStatusFilter = ProductStatus | 'all';
export type ProductPriceRange = 'all' | 'under_25' | '25_50' | '50_75' | 'over_75';

export interface ProductCategoryRelation {
  id?: string;
  name: string | null;
  slug?: string | null;
}

export interface ProductGalleryItem {
  url: string;
  alt?: string;
}

export type ProductGallery = string[] | ProductGalleryItem[] | null;

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  slug: string | null;
  description: string | null;
  short_description: string | null;
  sku: string | null;
  image_url: string | null;
  gallery: ProductGallery;
  price: number;
  sale_price: number | null;
  stock: number | null;
  sold_count: number | null;
  is_featured: boolean | null;
  is_new: boolean | null;
  is_active: boolean | null;
  rating: number | null;
  created_at: string | null;

  categories?: ProductCategoryRelation | ProductCategoryRelation[] | null;
  categoryName?: string;
}

export interface ProductStats {
  total: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  featured: number;
  newProducts: number;
  inactive: number;
}

export interface ProductMutationPayload {
  category_id?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  short_description?: string | null;
  sku?: string | null;
  image_url?: string | null;
  gallery?: ProductGallery;
  price: number;
  sale_price?: number | null;
  stock?: number | null;
  sold_count?: number | null;
  is_featured?: boolean | null;
  is_new?: boolean | null;
  is_active?: boolean | null;
  rating?: number | null;
}

export interface ProductFormModel {
  name: string;
  slug: string;
  sku: string;
  categoryId: string | null;
  price: number | null;
  salePrice: number | null;
  stock: number | null;
  soldCount: number | null;
  rating: number | null;
  shortDescription: string;
  description: string;
  imageUrl: string;
  gallery: ProductGallery;
  isFeatured: boolean;
  isNew: boolean;
  isActive: boolean;
}

export interface ProductTableBadgeData {
  label: string;
  className: string;
}

export interface ProductTableRowData {
  id: string;
  raw: Product;
  product: {
    imageUrl: string | null;
    title: string;
    subtitle: string;
    initials: string;
    featured: boolean;
  };
  slug: string;
  sku: string;
  category: string;
  price: {
    value: string;
    originalValue: string | null;
  };
  salePrice: string;
  stock: {
    value: number;
    status: ProductStatus;
  };
  sold: number;
  rating: string;
  featured: ProductTableBadgeData;
  newProduct: ProductTableBadgeData;
  active: ProductTableBadgeData;
  status: ProductStatus;
  createdAt: string;
  shortDescription: string;
  imageUrl: string;
  actions: null;
}
