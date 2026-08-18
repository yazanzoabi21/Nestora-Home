import { Injectable, inject } from '@angular/core';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { Product } from '../../../data-access/models';
import { CustomerProduct, CustomerProductDetails, CustomerProductVariant } from '../models';
import { CustomerReviewsService } from './customer-reviews.service';

const PRODUCT_SELECT = `
  id,
  category_id,
  media_id,
  name,
  slug,
  description,
  short_description,
  sku,
  image_url,
  gallery,
  features,
  price,
  sale_price,
  stock,
  sold_count,
  is_featured,
  is_new,
  is_active,
  is_loyalty_eligible,
  rating,
  created_at,
  categories (
    id,
    name,
    slug
  ),
  product_variants (
    id,
    product_id,
    option_name,
    option_value,
    name,
    sku,
    price,
    sale_price,
    stock,
    attributes,
    media_id,
    image_url,
    is_active,
    sort_order,
    created_at,
    updated_at
  )
`;

@Injectable({ providedIn: 'root' })
export class NewArrivalsService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly reviewsService = inject(CustomerReviewsService);

  async getProducts(): Promise<CustomerProduct[]> {
    const { data, error } = await this.supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return this.mapCustomerProducts(
      (data ?? [])
        .map((product) => this.mapProduct(product as Product))
        .filter((product) => product.is_active !== false),
    );
  }

  async getNewArrivals(): Promise<CustomerProduct[]> {
    const products = await this.getProducts();
    return products.filter((product) => product.isNew);
  }

  async getBestSellers(): Promise<CustomerProduct[]> {
    const { data, error } = await this.supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      .order('sold_count', { ascending: false })
      .order('rating', { ascending: false });

    if (error) throw new Error(error.message);

    return this.mapCustomerProducts(
      (data ?? []).map((product) => this.mapProduct(product as Product)),
    );
  }

  async getProductsByIds(ids: readonly string[]): Promise<CustomerProduct[]> {
    const uniqueIds = [...new Set(ids.filter((id) => Boolean(id.trim())))];
    if (uniqueIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .in('id', uniqueIds)
      .eq('is_active', true);

    if (error) throw new Error(error.message);

    const products = (data ?? []).map((product) =>
      this.toCustomerProduct(this.mapProduct(product as Product)),
    );
    const productsById = new Map(products.map((product) => [product.id, product]));

    return uniqueIds.flatMap((id) => {
      const product = productsById.get(id);
      return product ? [product] : [];
    });
  }

  async getProductDetails(identifier: string): Promise<CustomerProductDetails | null> {
    const product =
      (await this.getProductBySlug(identifier)) ?? (await this.getProductById(identifier));
    if (!product || product.is_active === false) {
      return null;
    }
    const reviews = await this.reviewsService.getPublishedReviewsByProduct(product.id);
    const mapped = this.withPublishedReviewStats(this.toCustomerProduct(product, false), reviews);
    return {
      ...mapped,
      longDescription: product.description || undefined,
      gallery: this.galleryUrls(product),
      sku: product.sku,
      variants: (product.product_variants ?? [])
        .filter((variant) => variant.is_active !== false)
        .map((variant): CustomerProductVariant => ({
          id: variant.id,
          optionName: variant.option_name,
          optionValue: variant.option_value,
          name: variant.name,
          sku: variant.sku,
          price: variant.price === null ? null : Number(variant.price),
          salePrice: variant.sale_price === null ? null : Number(variant.sale_price),
          stock: variant.stock === null ? null : Math.max(0, Number(variant.stock)),
          attributes: variant.attributes ?? {},
          imageUrl: variant.image_url,
          isActive: variant.is_active !== false,
          sortOrder: Number(variant.sort_order ?? 0),
        }))
        .sort((left, right) => left.sortOrder - right.sortOrder),
      features: Array.isArray(product.features)
        ? product.features.filter(
          (feature): feature is string => typeof feature === 'string' && !!feature.trim(),
        )
        : [],
    };
  }

  private withPublishedReviewStats(
    product: CustomerProduct,
    reviews: Awaited<ReturnType<CustomerReviewsService['getPublishedReviewsByProduct']>>,
  ): CustomerProduct {
    const ratings = reviews.flatMap((review) => (review.rating === null ? [] : [review.rating]));
    return {
      ...product,
      rating: ratings.length
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0,
      reviewCount: reviews.length,
    };
  }

  private toCustomerProduct(product: Product, useDefaultVariant = true): CustomerProduct {
    const defaultVariant = useDefaultVariant ? (product.product_variants ?? [])
      .filter((variant) => variant.is_active !== false)
      .sort((left, right) => Number(left.sort_order) - Number(right.sort_order))[0] : undefined;
    const regularPrice = Number(defaultVariant?.price ?? product.price ?? 0);
    const salePrice =
      defaultVariant?.sale_price === null || defaultVariant?.sale_price === undefined
        ? product.sale_price === null
          ? null
          : Number(product.sale_price)
        : Number(defaultVariant.sale_price);
    const currentPrice = salePrice !== null && salePrice < regularPrice ? salePrice : regularPrice;
    const hasDiscount = regularPrice > 0 && currentPrice < regularPrice;
    const stock = Math.max(0, Number(defaultVariant?.stock ?? product.stock ?? 0));

    return {
      id: product.id,
      name: product.name,
      brand: 'Nestora',
      category: product.categoryName || 'Uncategorized',
      imageUrl:
        defaultVariant?.image_url || product.image_url || 'assets/images/product-placeholder.png',
      description: product.short_description || product.description || undefined,
      price: currentPrice,
      originalPrice: hasDiscount ? regularPrice : null,
      rating: Number(product.rating ?? 0),
      reviewCount: 0,
      discountPercentage: hasDiscount
        ? Math.round(((regularPrice - currentPrice) / regularPrice) * 100)
        : null,
      badge: product.is_new ? 'New' : null,
      isFeatured: product.is_featured === true,
      isNew: product.is_new === true,
      isActive: product.is_active !== false,
      isLoyaltyEligible: product.is_loyalty_eligible !== false,
      soldCount: Math.max(0, Number(product.sold_count ?? 0)),
      inStock: product.is_active !== false && stock > 0,
      stock,
      createdAt: product.created_at,
      slug: product.slug,
      sku: defaultVariant?.sku ?? product.sku,
      variantId: defaultVariant?.id ?? null,
      variantLabel: defaultVariant
        ? defaultVariant.name || `${defaultVariant.option_name}: ${defaultVariant.option_value}`
        : null,
      variantOptionName: defaultVariant?.option_name ?? null,
      variantOptionValue: defaultVariant?.option_value ?? null,
      variantAttributes: defaultVariant?.attributes ?? {},
    };
  }

  private mapCustomerProducts(products: Product[]): Promise<CustomerProduct[]> {
    return Promise.all(
      products.map(async (product) =>
        this.withPublishedReviewStats(
          this.toCustomerProduct(product),
          await this.reviewsService.getPublishedReviewsByProduct(product.id),
        ),
      ),
    );
  }

  private galleryUrls(product: Product): string[] {
    const gallery = Array.isArray(product.gallery) ? product.gallery : [];
    const urls = gallery
      .map((item) => (typeof item === 'string' ? item : item.url))
      .filter((url) => Boolean(url));
    return [...new Set([product.image_url, ...urls].filter((url): url is string => Boolean(url)))];
  }

  private async getProductBySlug(slug: string): Promise<Product | null> {
    const { data, error } = await this.supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? this.mapProduct(data as Product) : null;
  }

  private async getProductById(id: string): Promise<Product | null> {
    const { data, error } = await this.supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? this.mapProduct(data as Product) : null;
  }

  private mapProduct(product: Product): Product {
    const categories = product.categories;
    const category = Array.isArray(categories) ? categories[0] : categories;

    return {
      ...product,
      slug: product.slug || this.createSlug(product.name),
      sku: product.sku ?? null,
      media_id: product.media_id ?? null,
      stock: product.stock ?? null,
      sold_count: product.sold_count ?? null,
      is_featured: product.is_featured ?? null,
      is_new: product.is_new ?? null,
      is_active: product.is_active ?? null,
      rating: product.rating ?? null,
      product_variants: product.product_variants ?? [],
      categoryName: category?.name || 'Uncategorized',
    };
  }

  private createSlug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
