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

export type ProductVariantAttributes = Readonly<Record<string, string>>;

export interface ProductVariant {
  id: string;
  product_id: string;
  option_name: string;
  option_value: string;
  name: string | null;
  sku: string | null;
  price: number | null;
  sale_price: number | null;
  stock: number | null;
  attributes: ProductVariantAttributes;
  media_id: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProductVariantMutationPayload {
  id?: string;
  option_name: string;
  option_value: string;
  name?: string | null;
  sku?: string | null;
  price?: number | null;
  sale_price?: number | null;
  stock?: number | null;
  attributes?: ProductVariantAttributes;
  media_id?: string | null;
  image_url?: string | null;
  is_active?: boolean;
  sort_order: number;
}

export interface ProductVariantFormModel {
  clientId: string;
  id: string | null;
  optionName: string;
  optionValue: string;
  name: string;
  sku: string;
  price: number | null;
  salePrice: number | null;
  stock: number | null;
  attributes: ProductVariantAttributes;
  attributesText: string;
  mediaId: string | null;
  imageUrl: string;
  imageFile: File | null;
  isActive: boolean;
}

export interface Product {
  id: string;
  category_id: string | null;
  media_id?: string | null;
  name: string;
  slug: string | null;
  description: string | null;
  short_description: string | null;
  sku: string | null;
  image_url: string | null;
  gallery: ProductGallery;
  features: string[];
  price: number;
  sale_price: number | null;
  cost_price: number | null;
  stock: number | null;
  sold_count: number | null;
  is_featured: boolean | null;
  is_new: boolean | null;
  is_active: boolean | null;
  is_loyalty_eligible: boolean;
  rating: number | null;
  created_at: string | null;
  product_variants?: ProductVariant[] | null;

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
  media_id?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  short_description?: string | null;
  sku?: string | null;
  image_url?: string | null;
  gallery?: ProductGallery;
  features?: string[];
  price: number;
  sale_price?: number | null;
  cost_price?: number | null;
  stock?: number | null;
  sold_count?: number | null;
  is_featured?: boolean | null;
  is_new?: boolean | null;
  is_active?: boolean | null;
  is_loyalty_eligible?: boolean;
  rating?: number | null;
}

export interface ProductFormModel {
  name: string;
  slug: string;
  sku: string;
  categoryId: string | null;
  mediaId: string | null;
  price: number | null;
  salePrice: number | null;
  costPrice: number | null;
  stock: number | null;
  soldCount: number | null;
  rating: number | null;
  shortDescription: string;
  description: string;
  imageUrl: string;
  gallery: ProductGallery;
  features: string[];
  isFeatured: boolean;
  isNew: boolean;
  isActive: boolean;
  isLoyaltyEligible: boolean;
  hasVariants: boolean;
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
  costPrice: string;
  totalPrice: string;
  totalCostPrice: string;
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
