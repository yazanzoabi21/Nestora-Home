import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../core/services/supabase';
import {
  Product,
  ProductCategoryRelation,
  ProductMutationPayload,
  ProductStats,
  ProductStatus,
} from '../models';

const LOW_STOCK_LIMIT = 25;

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

@Injectable({
  providedIn: 'root',
})
export class ProductsService {
  private readonly supabase = inject(SupabaseService).client;

  async getProducts(): Promise<Product[]> {
    const { data, error } = await this.supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((product) => this.mapProduct(product as Product));
  }

  async getProductStats(): Promise<ProductStats> {
    const products = await this.getProducts();

    return products.reduce<ProductStats>(
      (stats, product) => {
        const status = this.getProductStatus(product.stock);

        stats.total += 1;
        stats.inStock += status === 'in_stock' ? 1 : 0;
        stats.lowStock += status === 'low_stock' ? 1 : 0;
        stats.outOfStock += status === 'out_of_stock' ? 1 : 0;
        stats.featured += product.is_featured ? 1 : 0;
        stats.newProducts += product.is_new ? 1 : 0;
        stats.inactive += product.is_active === false ? 1 : 0;

        return stats;
      },
      {
        total: 0,
        inStock: 0,
        lowStock: 0,
        outOfStock: 0,
        featured: 0,
        newProducts: 0,
        inactive: 0,
      }
    );
  }

  async createProduct(payload: ProductMutationPayload): Promise<Product> {
    const { data, error } = await this.supabase
      .from('products')
      .insert(this.toProductRecord(payload))
      .select(PRODUCT_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapProduct(data as Product);
  }

  async updateProduct(id: string, payload: ProductMutationPayload): Promise<Product> {
    const { data, error } = await this.supabase
      .from('products')
      .update(this.toProductRecord(payload))
      .eq('id', id)
      .select(PRODUCT_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapProduct(data as Product);
  }

  async deleteProduct(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  async toggleProductActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('products')
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  getProductStatus(stock: number | null | undefined): ProductStatus {
    const stockValue = stock ?? 0;

    if (stockValue <= 0) {
      return 'out_of_stock';
    }

    if (stockValue <= LOW_STOCK_LIMIT) {
      return 'low_stock';
    }

    return 'in_stock';
  }

  private mapProduct(product: Product): Product {
    const categoryRelation = this.resolveCategoryRelation(product.categories);

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
      categoryName: categoryRelation?.name || 'Uncategorized',
    };
  }

  private resolveCategoryRelation(
    categories: ProductCategoryRelation | ProductCategoryRelation[] | null | undefined
  ): ProductCategoryRelation | null {
    if (Array.isArray(categories)) {
      return categories[0] ?? null;
    }

    return categories ?? null;
  }

  private toProductRecord(payload: ProductMutationPayload): ProductMutationPayload {
    const name = payload.name.trim();
    const slug = payload.slug?.trim() || this.createSlug(name);

    return {
      category_id: payload.category_id ?? null,
      media_id: payload.media_id ?? null,
      name,
      slug,
      description: payload.description ?? null,
      short_description: payload.short_description ?? null,
      sku: payload.sku?.trim() || null,
      image_url: payload.image_url ?? null,
      gallery: payload.gallery ?? null,
      price: Number(payload.price ?? 0),
      sale_price:
        payload.sale_price === null || payload.sale_price === undefined
          ? null
          : Number(payload.sale_price),
      stock:
        payload.stock === null || payload.stock === undefined
          ? null
          : Number(payload.stock),
      sold_count:
        payload.sold_count === null || payload.sold_count === undefined
          ? null
          : Number(payload.sold_count),
      is_featured: payload.is_featured ?? null,
      is_new: payload.is_new ?? null,
      is_active: payload.is_active ?? null,
      rating:
        payload.rating === null || payload.rating === undefined
          ? null
          : Number(payload.rating),
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
