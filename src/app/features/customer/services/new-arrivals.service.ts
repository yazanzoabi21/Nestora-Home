import { Injectable, inject } from '@angular/core';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { Product } from '../../../data-access/models';
import { CustomerProduct, CustomerProductDetails } from '../models';
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
  rating,
  created_at,
  categories (
    id,
    name,
    slug
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

    const products = (data ?? []).map((product) => this.mapProduct(product as Product));
    return Promise.all(
      products
        .filter((product) => product.is_active !== false)
        .map(async (product) =>
          this.withPublishedReviewStats(
            this.toCustomerProduct(product),
            await this.reviewsService.getPublishedReviewsByProduct(product.id),
          ),
        ),
    );
  }

  async getNewArrivals(): Promise<CustomerProduct[]> {
    const products = await this.getProducts();
    return products.filter((product) => product.isNew);
  }

  async getProductDetails(identifier: string): Promise<CustomerProductDetails | null> {
    const product = (await this.getProductBySlug(identifier)) ?? (await this.getProductById(identifier));
    if (!product || product.is_active === false) {
      return null;
    }
    const reviews = await this.reviewsService.getPublishedReviewsByProduct(product.id);
    const mapped = this.withPublishedReviewStats(this.toCustomerProduct(product), reviews);
    return {
      ...mapped,
      longDescription: product.description || undefined,
      gallery: this.galleryUrls(product),
      sku: product.sku,
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

  private toCustomerProduct(product: Product): CustomerProduct {
    const regularPrice = Number(product.price ?? 0);
    const salePrice = product.sale_price === null ? null : Number(product.sale_price);
    const currentPrice = salePrice !== null && salePrice < regularPrice ? salePrice : regularPrice;
    const hasDiscount = regularPrice > 0 && currentPrice < regularPrice;

    return {
      id: product.id,
      name: product.name,
      brand: 'Nestora',
      category: product.categoryName || 'Uncategorized',
      imageUrl: product.image_url || 'assets/images/product-placeholder.png',
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
      inStock: Number(product.stock ?? 0) > 0,
      stock: Number(product.stock ?? 0),
      createdAt: product.created_at,
      slug: product.slug,
    };
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
