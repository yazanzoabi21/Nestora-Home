import { Product, ProductCategoryRelation, ProductStatus } from './product.model';

export type InventoryChangeType = 'restock' | 'adjustment' | 'damage' | 'return' | 'correction';
export type InventoryStatusFilter = ProductStatus | 'all';

export interface InventoryProduct extends Product {
  categories?: ProductCategoryRelation | ProductCategoryRelation[] | null;
  categoryName?: string;
}

export interface InventoryLog {
  id: string;
  product_id: string | null;
  previous_stock: number | null;
  new_stock: number | null;
  change_type: InventoryChangeType | string | null;
  note: string | null;
  created_at: string | null;
  products?: {
    id: string;
    name: string;
    sku: string | null;
  } | null;
}

export interface InventoryStats {
  inStock: number;
  lowStock: number;
  outOfStock: number;
  inventoryValue: number;
}

export interface StockUpdateFormModel {
  newStock: number | null;
  changeType: InventoryChangeType;
  note: string;
}
