import { CustomerProduct } from './customer-product.model';

export interface CustomerCartLine {
  id?: string;
  product: CustomerProduct;
  quantity: number;
}
export interface GuestCartItem {
  productId: string;
  quantity: number;
}
export interface CartTotals {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
}
