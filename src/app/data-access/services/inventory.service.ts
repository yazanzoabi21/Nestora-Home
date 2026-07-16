import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../../core/services/supabase';
import {
  InventoryChangeType,
  InventoryLog,
  InventoryProduct,
  InventoryStats,
  ProductCategoryRelation,
  ProductStatus,
} from '../models';

export const LOW_STOCK_LIMIT = 25;

const INVENTORY_PRODUCT_SELECT = `
  id,
  category_id,
  name,
  slug,
  sku,
  image_url,
  price,
  sale_price,
  stock,
  sold_count,
  created_at,
  categories (
    id,
    name,
    slug
  )
`;

const INVENTORY_LOG_SELECT = `
  id,
  product_id,
  previous_stock,
  new_stock,
  change_type,
  note,
  created_at,
  products (
    id,
    name,
    sku
  )
`;

@Injectable({
  providedIn: 'root',
})
export class InventoryService {
  private readonly supabase = inject(SupabaseService).client;

  async getInventoryProducts(): Promise<InventoryProduct[]> {
    const { data, error } = await this.supabase
      .from('products')
      .select(INVENTORY_PRODUCT_SELECT)
      .order('name', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((product) => this.mapInventoryProduct(product as InventoryProduct));
  }

  async updateProductStock(
    productId: string,
    _previousStock: number,
    newStock: number,
    changeType: InventoryChangeType,
    note: string | null,
  ): Promise<void> {
    if (!Number.isInteger(newStock) || newStock < 0) {
      throw new Error('Stock must be a non-negative integer.');
    }

    const { error } = await this.supabase.rpc('update_inventory_stock', {
      p_product_id: productId,
      p_new_stock: newStock,
      p_change_type: changeType,
      p_note: note,
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  async getInventoryLogs(productId?: string): Promise<InventoryLog[]> {
    let query = this.supabase
      .from('inventory_logs')
      .select(INVENTORY_LOG_SELECT)
      .order('created_at', { ascending: false });

    if (productId) {
      query = query.eq('product_id', productId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as InventoryLog[];
  }

  getInventoryStats(products: InventoryProduct[]): InventoryStats {
    return products.reduce<InventoryStats>(
      (stats, product) => {
        const status = this.getProductStatus(product.stock);
        const stock = product.stock ?? 0;
        const unitPrice = this.unitPrice(product);

        stats.inStock += status === 'in_stock' ? 1 : 0;
        stats.lowStock += status === 'low_stock' ? 1 : 0;
        stats.outOfStock += status === 'out_of_stock' ? 1 : 0;
        stats.inventoryValue += stock * unitPrice;

        return stats;
      },
      {
        inStock: 0,
        lowStock: 0,
        outOfStock: 0,
        inventoryValue: 0,
      },
    );
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

  unitPrice(product: InventoryProduct): number {
    return product.sale_price ?? product.price ?? 0;
  }

  private mapInventoryProduct(product: InventoryProduct): InventoryProduct {
    const categoryRelation = this.resolveCategoryRelation(product.categories);

    return {
      ...product,
      sku: product.sku ?? null,
      image_url: product.image_url ?? null,
      stock: product.stock ?? 0,
      sold_count: product.sold_count ?? 0,
      sale_price: product.sale_price ?? null,
      categoryName: categoryRelation?.name || 'Uncategorized',
    };
  }

  private resolveCategoryRelation(
    categories: ProductCategoryRelation | ProductCategoryRelation[] | null | undefined,
  ): ProductCategoryRelation | null {
    if (Array.isArray(categories)) {
      return categories[0] ?? null;
    }

    return categories ?? null;
  }
}
