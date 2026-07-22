import { Injectable, inject } from '@angular/core';

import { CustomerAuthService } from '../../../core/services/auth';
import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { CustomerOrder, CustomerOrderItem } from './customer-order.model';

interface CustomerOrderDatabaseRow {
  id: string;
  user_id: string;
  order_number: string | null;
  status: string | null;
  payment_status: string | null;
  subtotal: number | string | null;
  shipping: number | string | null;
  payment_fee: number | string | null;
  discount_amount: number | string | null;
  total: number | string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string | null;
  shipping_method_id: string | null;
  payment_method_id: string | null;
  discount_code: string | null;
}

interface CustomerOrderItemDatabaseRow {
  order_id: string;
  product_id: string;
  quantity: number | string | null;
  price: number | string | null;
  total: number | string | null;
}

interface CustomerOrderProductDatabaseRow {
  id: string;
  name: string | null;
  slug: string | null;
  image_url: string | null;
}

const ORDER_SELECT = `
  id,
  user_id,
  order_number,
  status,
  payment_status,
  subtotal,
  shipping,
  payment_fee,
  discount_amount,
  total,
  address,
  city,
  country,
  phone,
  notes,
  created_at,
  shipping_method_id,
  payment_method_id,
  discount_code
`;

const ORDER_ITEM_SELECT = 'order_id, product_id, quantity, price, total';
const PRODUCT_SELECT = 'id, name, slug, image_url';

@Injectable({ providedIn: 'root' })
export class CustomerOrdersService {
  private readonly auth = inject(CustomerAuthService);
  private readonly supabase = inject(CUSTOMER_SUPABASE);

  async getCustomerOrders(): Promise<CustomerOrder[]> {
    const userId = await this.requireAuthenticatedCustomerId();

    const { data, error } = await this.supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Unable to load your orders: ${error.message}`);
    }

    const orderRows = (data ?? []) as unknown as CustomerOrderDatabaseRow[];
    if (!orderRows.length) return [];

    const itemsByOrderId = await this.loadItemsByOrderId(orderRows.map((order) => order.id));

    return orderRows.map((order) => this.mapOrder(order, itemsByOrderId.get(order.id) ?? []));
  }

  async getCustomerOrderCount(): Promise<number> {
    const userId = await this.requireAuthenticatedCustomerId();
    const { count, error } = await this.supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Unable to load the order count: ${error.message}`);
    }

    return count ?? 0;
  }

  private async loadItemsByOrderId(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, CustomerOrderItem[]>> {
    const { data, error } = await this.supabase
      .from('order_items')
      .select(ORDER_ITEM_SELECT)
      .in('order_id', [...orderIds]);

    if (error) {
      throw new Error(`Unable to load the order products: ${error.message}`);
    }

    const itemRows = (data ?? []) as unknown as CustomerOrderItemDatabaseRow[];
    const productsById = await this.loadProductsById(
      [...new Set(itemRows.map((item) => item.product_id).filter(Boolean))],
    );
    const itemsByOrderId = new Map<string, CustomerOrderItem[]>();

    for (const item of itemRows) {
      const product = productsById.get(item.product_id);
      const mappedItem = this.mapOrderItem(item, product);
      const orderItems = itemsByOrderId.get(item.order_id) ?? [];
      orderItems.push(mappedItem);
      itemsByOrderId.set(item.order_id, orderItems);
    }

    return itemsByOrderId;
  }

  private async loadProductsById(
    productIds: readonly string[],
  ): Promise<ReadonlyMap<string, CustomerOrderProductDatabaseRow>> {
    if (!productIds.length) return new Map<string, CustomerOrderProductDatabaseRow>();

    const { data, error } = await this.supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .in('id', [...productIds]);

    if (error) {
      throw new Error(`Unable to load product details for your orders: ${error.message}`);
    }

    const products = (data ?? []) as unknown as CustomerOrderProductDatabaseRow[];
    return new Map(products.map((product) => [product.id, product]));
  }

  private async requireAuthenticatedCustomerId(): Promise<string> {
    const userId = await this.auth.getCurrentUserId();
    if (!userId) {
      throw new Error('You must be signed in to view your orders.');
    }
    return userId;
  }

  private mapOrder(
    order: CustomerOrderDatabaseRow,
    items: readonly CustomerOrderItem[],
  ): CustomerOrder {
    return {
      id: order.id,
      userId: order.user_id,
      orderNumber: order.order_number?.trim() || this.getShortOrderNumber(order.id),
      status: this.normalizeStatus(order.status, 'pending'),
      paymentStatus: this.normalizeStatus(order.payment_status, 'unpaid'),
      subtotal: this.toAmount(order.subtotal),
      shipping: this.toAmount(order.shipping),
      paymentFee: this.toAmount(order.payment_fee),
      discountAmount: this.toAmount(order.discount_amount),
      total: this.toAmount(order.total),
      address: order.address,
      city: order.city,
      country: order.country,
      phone: order.phone,
      notes: order.notes,
      createdAt: order.created_at,
      shippingMethodId: order.shipping_method_id,
      paymentMethodId: order.payment_method_id,
      discountCode: order.discount_code,
      items,
    };
  }

  private mapOrderItem(
    item: CustomerOrderItemDatabaseRow,
    product: CustomerOrderProductDatabaseRow | undefined,
  ): CustomerOrderItem {
    const quantity = Math.max(1, Math.trunc(this.toAmount(item.quantity)));
    const unitPrice = this.toAmount(item.price);
    const lineTotal =
      item.total === null ? unitPrice * quantity : this.toAmount(item.total);

    return {
      id: `${item.order_id}:${item.product_id}`,
      productId: item.product_id,
      productName: product?.name?.trim() || null,
      productSlug: product?.slug?.trim() || null,
      productImageUrl: product?.image_url?.trim() || null,
      quantity,
      unitPrice,
      lineTotal,
    };
  }

  private normalizeStatus(value: string | null, fallback: string): string {
    const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, '_');
    return normalized || fallback;
  }

  private toAmount(value: number | string | null): number {
    const amount = typeof value === 'number' ? value : Number(value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  }

  private getShortOrderNumber(id: string): string {
    return `ORD-${id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  }
}
