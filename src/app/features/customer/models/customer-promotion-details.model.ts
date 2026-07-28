import { Promotion } from '../../../data-access';
import { CustomerProduct } from './customer-product.model';

export interface PromotionProductItem {
  sort_order: number;
  promotional_price: number | null;
  product: CustomerProduct;
}

export interface PromotionDetailsData extends Promotion {
  promotion_products: PromotionProductItem[];
}
