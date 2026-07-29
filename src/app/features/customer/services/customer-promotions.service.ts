import { Injectable, inject } from '@angular/core';

import { Promotion } from '../../../data-access';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { CustomerProduct, PromotionDetailsData, PromotionProductItem } from '../models';

interface PromotionProductRecord {
  sort_order: number | string | null;
  promotional_price: number | string | null;
  product: PromotionProductData | PromotionProductData[] | null;
}

interface PromotionProductData {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  short_description: string | null;
  image_url: string | null;
  price: number | string | null;
  sale_price: number | string | null;
  stock: number | string | null;
  sold_count: number | string | null;
  is_featured: boolean | null;
  is_new: boolean | null;
  is_active: boolean | null;
  rating: number | string | null;
  created_at: string | null;
  categories: { name: string | null } | { name: string | null }[] | null;
}

type PromotionDetailsRecord = Promotion & {
  promotion_products?: PromotionProductRecord[] | null;
};

const FLASH_DEAL_PROMOTION_SELECT = `
  id,
  slug,
  title,
  description,
  media_id,
  image_url,
  button_text,
  button_link,
  placement,
  display_type,
  icon,
  badge_text,
  secondary_badge_text,
  background_color,
  text_color,
  sort_order,
  is_active,
  start_date,
  end_date,
  created_at
`;

@Injectable({
  providedIn: 'root',
})
export class CustomerPromotionsService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);

  async getFlashDealPromotions(): Promise<Promotion[]> {
    const { data, error } = await this.supabase
      .from('promotions')
      .select(FLASH_DEAL_PROMOTION_SELECT)
      .eq('placement', 'home_flash_deals')
      .eq('display_type', 'banner')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? [])
      .map((promotion) => ({
        ...(promotion as Promotion),
        sort_order: this.toNumber(promotion.sort_order),
      }))
      .filter((promotion) => this.isActive(promotion));
  }

  async getPromotionBySlug(slug: string): Promise<PromotionDetailsData | null> {
    const { data, error } = await this.supabase
      .from('promotions')
      .select(
        `
        id,
        slug,
        title,
        description,
        media_id,
        image_url,
        button_text,
        button_link,
        placement,
        display_type,
        icon,
        badge_text,
        secondary_badge_text,
        background_color,
        text_color,
        sort_order,
        is_active,
        start_date,
        end_date,
        created_at,
        promotion_products (
          sort_order,
          promotional_price,
          product:products (
            id,
            name,
            slug,
            description,
            short_description,
            image_url,
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
              name
            )
          )
        )
      `,
      )
      .eq('slug', slug)
      .order('sort_order', {
        ascending: true,
        referencedTable: 'promotion_products',
      })
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return null;
    }

    const record = data as unknown as PromotionDetailsRecord;

    if (!this.isActive(record)) {
      return null;
    }

    const promotionProducts = (record.promotion_products ?? [])
      .map((item) => this.mapPromotionProduct(item))
      .filter((item): item is PromotionProductItem => item !== null)
      .sort((first, second) => first.sort_order - second.sort_order);

    return {
      ...record,
      promotion_products: promotionProducts,
    };
  }

  isActive(promotion: Promotion): boolean {
    const now = Date.now();
    const startTime = promotion.start_date ? new Date(promotion.start_date).getTime() : null;
    const endTime = promotion.end_date ? new Date(promotion.end_date).getTime() : null;

    return (
      promotion.is_active !== false &&
      (!startTime || startTime <= now) &&
      (!endTime || endTime >= now)
    );
  }

  promotionLink(promotion: Promotion): string {
    return promotion.slug ? `/shop/promotions/${promotion.slug}` : '/shop/products';
  }

  private mapPromotionProduct(item: PromotionProductRecord): PromotionProductItem | null {
    const product = Array.isArray(item.product) ? item.product[0] : item.product;

    if (!product || product.is_active !== true) {
      return null;
    }

    return {
      sort_order: this.toNumber(item.sort_order),
      promotional_price:
        item.promotional_price === null ? null : this.toNumber(item.promotional_price),
      product: this.toCustomerProduct(product),
    };
  }

  private toCustomerProduct(product: PromotionProductData): CustomerProduct {
    const regularPrice = this.toNumber(product.price);
    const salePrice = product.sale_price === null ? null : this.toNumber(product.sale_price);
    const currentPrice = salePrice !== null && salePrice < regularPrice ? salePrice : regularPrice;
    const hasDiscount = regularPrice > 0 && currentPrice < regularPrice;
    const stock = Math.max(0, this.toNumber(product.stock));
    const categoryRelation = Array.isArray(product.categories)
      ? product.categories[0]
      : product.categories;

    return {
      id: product.id,
      name: product.name,
      brand: 'Nestora',
      category: categoryRelation?.name || 'Uncategorized',
      imageUrl: product.image_url || 'assets/images/product-placeholder.png',
      description: product.short_description || product.description || undefined,
      price: currentPrice,
      originalPrice: hasDiscount ? regularPrice : null,
      rating: this.toNumber(product.rating),
      reviewCount: 0,
      discountPercentage: hasDiscount
        ? Math.round(((regularPrice - currentPrice) / regularPrice) * 100)
        : null,
      badge: product.is_new ? 'New' : null,
      isFeatured: product.is_featured === true,
      isNew: product.is_new === true,
      isActive: product.is_active === true,
      soldCount: Math.max(0, this.toNumber(product.sold_count)),
      inStock: stock > 0,
      stock,
      createdAt: product.created_at,
      slug: product.slug,
    };
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
