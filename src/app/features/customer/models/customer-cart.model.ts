import { CustomerProduct } from './customer-product.model';

export interface CustomerCartLine {
  id?: string;
  product: CustomerProduct;
  quantity: number;
  isFreeGift: boolean;
  appliedDiscountId: string | null;
  appliedDiscountCode: string | null;
}
export interface GuestCartItem {
  productId: string;
  variantId?: string | null;
  quantity: number;
  isFreeGift?: boolean;
  appliedDiscountId?: string | null;
  appliedDiscountCode?: string | null;
}
export interface CartTotals {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
}
