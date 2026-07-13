import { Injectable, inject } from '@angular/core';
import { Product } from '../../../data-access/models';
import { ProductsService } from '../../../data-access/services';
import { ReviewsService } from '../../../data-access/services';
import { CustomerProduct, CustomerProductDetails } from '../models';

@Injectable({ providedIn: 'root' })
export class NewArrivalsService {
  private readonly productsService = inject(ProductsService);
  private readonly reviewsService = inject(ReviewsService);

  async getProducts(): Promise<CustomerProduct[]> {
    const products = await this.productsService.getProducts();
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
    const product =
      (await this.productsService.getProductBySlug(identifier)) ??
      (await this.productsService.getProductById(identifier));
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
    reviews: Awaited<ReturnType<ReviewsService['getPublishedReviewsByProduct']>>,
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
}
