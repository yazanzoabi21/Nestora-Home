import { Injectable, inject } from '@angular/core';

import { ADMIN_SUPABASE } from '../../core/tokens';
import {
  AdminOrder,
  AdminOrderItem,
  OrderStats,
} from '../models';

interface SupabaseOrder {
  id: string;
  user_id: string | null;
  order_number: string | null;

  status: string | null;
  payment_status: string | null;

  subtotal: number | null;
  discount_amount: number | null;
  shipping: number | null;
  total: number | null;

  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  notes: string | null;

  created_at: string | null;

  loyalty_points_earned: number | null;
  loyalty_checkout_processed: boolean | null;
}

interface SupabaseProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface SupabaseOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string | null;
  variant_id: string | null;
  variant_name: string | null;
  variant_sku: string | null;
  variant_attributes: Readonly<Record<string, string>> | null;
  variant_image_url: string | null;

  quantity: number | null;
  price: number | null;
  total: number | null;

  loyalty_redeemed: boolean | null;
  loyalty_points_cost: number | null;
  loyalty_points_earned: number | null;
  loyalty_effective_unit_price: number | null;
  is_free_gift: boolean | null;
  original_unit_price: number | null;
  discounts: { code: string } | { code: string }[] | null;
}

interface SupabaseOrderProduct {
  id: string;
  name: string | null;
  sku: string | null;
  image_url: string | null;
}

interface SupabaseLoyaltyLedgerEntry {
  order_id: string | null;
}

interface SupabaseOrderShippingAddress {
  order_id: string;

  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;

  street_address: string | null;
  address_line_2: string | null;

  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;

  delivery_instructions: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class OrdersService {
  private readonly supabase = inject(ADMIN_SUPABASE);

  async getOrders(): Promise<AdminOrder[]> {
    await this.ensureAdminSession();

    const { data, error } = await this.supabase
      .from('orders')
      .select(`
        id,
        user_id,
        order_number,
        status,
        payment_status,
        subtotal,
        discount_amount,
        shipping,
        total,
        address,
        city,
        country,
        phone,
        notes,
        created_at,
        loyalty_points_earned,
        loyalty_checkout_processed
      `)
      .order('created_at', {
        ascending: false,
      });

    if (error) {
      throw error;
    }

    const orders = (data ?? []) as SupabaseOrder[];

    if (!orders.length) {
      return [];
    }

    const orderIds = orders.map(
      (order) => order.id,
    );

    const userIds = [
      ...new Set(
        orders
          .map((order) => order.user_id)
          .filter(
            (userId): userId is string =>
              typeof userId === 'string' &&
              userId.length > 0,
          ),
      ),
    ];

    const [
      profiles,
      orderItemsByOrderId,
      shippingAddresses,
      loyaltyProcessedOrderIds,
    ] = await Promise.all([
      this.fetchProfiles(userIds),

      this.fetchOrderItems(orderIds),

      this.fetchShippingAddresses(orderIds),

      this.fetchLoyaltyProcessedOrderIds(
        orderIds,
      ),
    ]);

    const profilesById = new Map(
      profiles.map((profile) => [
        profile.id,
        profile,
      ]),
    );

    const shippingAddressesByOrderId =
      new Map(
        shippingAddresses.map((address) => [
          address.order_id,
          address,
        ]),
      );

    return orders.map((order) => {
      const profile = order.user_id
        ? profilesById.get(order.user_id)
        : undefined;

      const shippingAddress =
        shippingAddressesByOrderId.get(
          order.id,
        );

      const orderItems =
        orderItemsByOrderId[order.id] ?? [];

      return this.mapToAdminOrder(
        order,
        profile,
        shippingAddress,
        orderItems,
        loyaltyProcessedOrderIds.has(
          order.id,
        ),
      );
    });
  }

  async updateOrderStatuses(
    orderId: string,
    deliveryStatus: AdminOrder['delivery'],
    paymentStatus: AdminOrder['payment'],
  ): Promise<void> {
    await this.ensureAdminSession();

    const { error } = await this.supabase.rpc(
      'update_admin_order_status',
      {
        p_order_id: orderId,
        p_status: deliveryStatus,
        p_payment_status: paymentStatus,
      },
    );

    if (error) {
      throw new Error(error.message);
    }
  }

  getOrderStats(
    orders: AdminOrder[],
  ): OrderStats {
    const processing = orders.filter(
      (order) =>
        order.delivery === 'Processing' ||
        order.delivery === 'Pending',
    ).length;

    const delivered = orders.filter(
      (order) =>
        order.delivery === 'Delivered' ||
        order.delivery === 'Completed',
    ).length;

    const refunded = orders.filter(
      (order) =>
        order.delivery === 'Returned' ||
        order.delivery === 'Cancelled' ||
        order.payment === 'Refunded',
    ).length;

    return {
      totalOrders: orders.length,
      processing,
      delivered,
      refunded,
    };
  }

  private async ensureAdminSession(): Promise<void> {
    const {
      data: { user },
      error,
    } = await this.supabase.auth.getUser();

    if (error) {
      throw error;
    }

    if (!user) {
      throw new Error(
        'The admin Supabase client does not have an authenticated session.',
      );
    }
  }

  private async fetchProfiles(
    userIds: string[],
  ): Promise<SupabaseProfile[]> {
    if (!userIds.length) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        phone
      `)
      .in('id', userIds);

    if (error) {
      throw error;
    }

    return (data ?? []) as SupabaseProfile[];
  }

  private async fetchShippingAddresses(
    orderIds: string[],
  ): Promise<SupabaseOrderShippingAddress[]> {
    if (!orderIds.length) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('order_shipping_addresses')
      .select(`
        order_id,
        first_name,
        last_name,
        email,
        phone,
        street_address,
        address_line_2,
        city,
        state_province,
        postal_code,
        country,
        delivery_instructions
      `)
      .in('order_id', orderIds);

    if (error) {
      throw error;
    }

    return (
      data ?? []
    ) as SupabaseOrderShippingAddress[];
  }

  /**
   * Loads the actual items ordered by the customer.
   *
   * product_name, price and total come from order_items because
   * they are checkout snapshots.
   *
   * image_url and SKU come from products because they are only
   * used for the admin UI.
   */
  private async fetchOrderItems(
    orderIds: string[],
  ): Promise<Record<string, AdminOrderItem[]>> {
    if (!orderIds.length) {
      return {};
    }

    const { data, error } = await this.supabase
      .from('order_items')
      .select(`
        id,
        order_id,
        product_id,
        product_name,
        variant_id,
        variant_name,
        variant_sku,
        variant_attributes,
        variant_image_url,
        quantity,
        price,
        total,
        loyalty_redeemed,
        loyalty_points_cost,
        loyalty_points_earned,
        loyalty_effective_unit_price
        ,is_free_gift,
        original_unit_price,
        discounts:applied_discount_id(code)
      `)
      .in('order_id', orderIds);

    if (error) {
      throw error;
    }

    const orderItems =
      (data ?? []) as SupabaseOrderItem[];

    const productIds = [
      ...new Set(
        orderItems
          .map((item) => item.product_id)
          .filter(
            (productId): productId is string =>
              typeof productId === 'string' &&
              productId.length > 0,
          ),
      ),
    ];

    const products =
      await this.fetchOrderProducts(
        productIds,
      );

    const productsById = new Map(
      products.map((product) => [
        product.id,
        product,
      ]),
    );

    const grouped: Record<
      string,
      AdminOrderItem[]
    > = {};

    for (const item of orderItems) {
      const product = item.product_id
        ? productsById.get(item.product_id)
        : undefined;

      const quantity = Math.max(
        0,
        Number(item.quantity ?? 0),
      );

      const unitPrice = Number(
        item.price ??
        item.loyalty_effective_unit_price ??
        0,
      );

      const lineTotal = Number(
        item.total ??
        unitPrice * quantity,
      );

      const mappedItem: AdminOrderItem = {
        id: item.id,

        productId:
          item.product_id ?? null,

        variantId: item.variant_id,
        variantName: item.variant_name,
        variantAttributes: item.variant_attributes ?? {},

        // Use the checkout snapshot first.
        name:
          item.product_name?.trim() ||
          product?.name?.trim() ||
          'Product',

        sku:
          item.variant_sku?.trim() || product?.sku?.trim() || null,

        imageUrl:
          item.variant_image_url?.trim() || product?.image_url?.trim() || null,

        quantity,
        unitPrice,
        total: lineTotal,

        isFreeGift: item.is_free_gift === true,
        originalUnitPrice: item.original_unit_price === null
          ? null
          : Number(item.original_unit_price),
        appliedDiscountCode: (
          Array.isArray(item.discounts) ? item.discounts[0] : item.discounts
        )?.code ?? null,

        loyaltyRedeemed:
          item.loyalty_redeemed === true,

        loyaltyPointsCost: Math.max(
          0,
          Number(
            item.loyalty_points_cost ?? 0,
          ),
        ),

        loyaltyPointsEarned: Math.max(
          0,
          Number(
            item.loyalty_points_earned ?? 0,
          ),
        ),
      };

      const items =
        grouped[item.order_id] ?? [];

      items.push(mappedItem);

      grouped[item.order_id] = items;
    }

    return grouped;
  }

  /**
   * Product metadata is optional for the invoice.
   *
   * If a product has been removed or product RLS prevents it
   * from loading, the historical order still works because
   * order_items contains the checkout snapshot.
   */
  private async fetchOrderProducts(
    productIds: string[],
  ): Promise<SupabaseOrderProduct[]> {
    if (!productIds.length) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('products')
      .select(`
        id,
        name,
        sku,
        image_url
      `)
      .in('id', productIds);

    if (error) {
      console.warn(
        'Unable to load product metadata for order items:',
        error,
      );

      return [];
    }

    return (
      data ?? []
    ) as SupabaseOrderProduct[];
  }

  private async fetchLoyaltyProcessedOrderIds(
    orderIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    if (!orderIds.length) {
      return new Set<string>();
    }

    const { data, error } = await this.supabase
      .from('customer_loyalty_points_ledger')
      .select('order_id')
      .in('order_id', [...orderIds])
      .eq('transaction_type', 'earn');

    if (error) {
      throw new Error(
        `Unable to load loyalty processing state: ${error.message}`,
      );
    }

    return new Set(
      (
        (data ??
          []) as SupabaseLoyaltyLedgerEntry[]
      )
        .map((entry) => entry.order_id)
        .filter(
          (orderId): orderId is string =>
            typeof orderId === 'string',
        ),
    );
  }

  private mapToAdminOrder(
    order: SupabaseOrder,
    profile: SupabaseProfile | undefined,
    shippingAddress:
      | SupabaseOrderShippingAddress
      | undefined,
    orderItems: AdminOrderItem[],
    loyaltyProcessed: boolean,
  ): AdminOrder {
    const orderId =
      order.order_number?.trim() ||
      this.getShortOrderId(order.id);

    const checkoutName =
      this.buildCustomerName(
        shippingAddress?.first_name,
        shippingAddress?.last_name,
      );

    const isLoggedInOrder =
      !!order.user_id;

    const loyaltyPoints =
      order.loyalty_checkout_processed
        ? Math.max(
          0,
          Math.floor(
            Number(
              order.loyalty_points_earned ??
              0,
            ),
          ),
        )
        : Math.max(
          0,
          Math.floor(
            Number(order.subtotal ?? 0) -
            Number(
              order.discount_amount ?? 0,
            ),
          ),
        );

    const customerName =
      isLoggedInOrder
        ? profile?.full_name?.trim() ||
        checkoutName ||
        'Registered Customer'
        : checkoutName ||
        'Guest Customer';

    const customerEmail =
      isLoggedInOrder
        ? profile?.email?.trim() ||
        shippingAddress?.email?.trim() ||
        ''
        : shippingAddress?.email?.trim() ||
        '';

    const phone =
      isLoggedInOrder
        ? profile?.phone?.trim() ||
        shippingAddress?.phone?.trim() ||
        order.phone?.trim() ||
        undefined
        : shippingAddress?.phone?.trim() ||
        order.phone?.trim() ||
        undefined;

    const itemCount = orderItems.reduce(
      (total, item) =>
        total + item.quantity,
      0,
    );

    return {
      id: orderId,
      orderId,

      supabaseOrderId: order.id,

      customerUserId: order.user_id,

      customerName,
      customerEmail,
      phone,

      date: this.formatDate(
        order.created_at,
      ),

      createdAt:
        order.created_at ?? '',

      items: itemCount,
      orderItems,

      subtotal: this.formatCurrency(
        order.subtotal,
      ),

      discount: this.formatCurrency(
        order.discount_amount,
      ),

      shipping: this.formatCurrency(
        order.shipping,
      ),

      total: this.formatCurrency(
        order.total,
      ),

      payment: this.normalizeStatus(
        order.payment_status,
      ) as AdminOrder['payment'],

      delivery: this.normalizeStatus(
        order.status,
      ) as AdminOrder['delivery'],

      address:
        this.buildAddress(
          shippingAddress,
        ) ||
        order.address?.trim() ||
        undefined,

      city:
        shippingAddress?.city?.trim() ||
        order.city?.trim() ||
        undefined,

      country:
        shippingAddress?.country?.trim() ||
        order.country?.trim() ||
        undefined,

      notes:
        shippingAddress
          ?.delivery_instructions
          ?.trim() ||
        order.notes?.trim() ||
        undefined,

      loyaltyPoints,
      loyaltyProcessed,
    };
  }

  private buildCustomerName(
    firstName: string | null | undefined,
    lastName: string | null | undefined,
  ): string {
    return [firstName, lastName]
      .map((value) => value?.trim())
      .filter(
        (value): value is string =>
          !!value,
      )
      .join(' ');
  }

  private buildAddress(
    shippingAddress:
      | SupabaseOrderShippingAddress
      | undefined,
  ): string {
    if (!shippingAddress) {
      return '';
    }

    return [
      shippingAddress.street_address,
      shippingAddress.address_line_2,
      shippingAddress.state_province,
      shippingAddress.postal_code,
    ]
      .map((value) => value?.trim())
      .filter(
        (value): value is string =>
          !!value,
      )
      .join(', ');
  }

  private normalizeStatus(
    status: string | null,
  ): string {
    if (!status) {
      return 'Pending';
    }

    const normalized =
      status.toLowerCase().trim();

    const statusMap: Record<
      string,
      string
    > = {
      pending: 'Pending',
      processing: 'Processing',
      shipped: 'Shipped',
      delivered: 'Delivered',
      completed: 'Completed',
      cancelled: 'Cancelled',
      canceled: 'Cancelled',
      returned: 'Returned',
      refunded: 'Refunded',
      failed: 'Failed',
      unpaid: 'Unpaid',
      paid: 'Paid',
    };

    return (
      statusMap[normalized] ||
      normalized.charAt(0).toUpperCase() +
      normalized.slice(1)
    );
  }

  private formatCurrency(
    amount: number | null | undefined,
  ): string {
    return `$${Number(
      amount ?? 0,
    ).toFixed(2)}`;
  }

  private formatDate(
    dateString: string | null,
  ): string {
    if (!dateString) {
      return 'N/A';
    }

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return 'N/A';
    }

    return date.toLocaleDateString(
      'en-GB',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      },
    );
  }

  private getShortOrderId(
    uuid: string,
  ): string {
    return `ORD-${uuid
      .substring(0, 4)
      .toUpperCase()}`;
  }
}
