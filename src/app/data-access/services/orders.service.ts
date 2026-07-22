import { Injectable, inject } from '@angular/core';

import { ADMIN_SUPABASE } from '../../core/tokens';
import { AdminOrder, OrderStats } from '../models';

interface SupabaseOrder {
  id: string;
  user_id: string | null;
  customer_id: string | null;
  order_number: string | null;
  status: string | null;
  payment_status: string | null;
  subtotal: number | null;
  shipping: number | null;
  total: number | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string | null;
}

interface SupabaseProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface SupabaseOrderItem {
  order_id: string;
  quantity: number | null;
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
  try {
    await this.ensureAdminSession();

    const { data: orders, error: ordersError } =
      await this.supabase
        .from('orders')
        .select(`
          id,
          user_id,
          customer_id,
          order_number,
          status,
          payment_status,
          subtotal,
          shipping,
          total,
          address,
          city,
          country,
          phone,
          notes,
          created_at
        `)
        .order('created_at', { ascending: false });

    if (ordersError) {
      throw ordersError;
    }

    if (!orders?.length) {
      return [];
    }

    const supabaseOrders = orders as SupabaseOrder[];

    const orderIds = supabaseOrders.map(
      (order) => order.id,
    );

    const userIds = [
      ...new Set(
        supabaseOrders
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
      orderItemsCounts,
      shippingAddresses,
    ] = await Promise.all([
      this.fetchProfiles(userIds),
      this.fetchOrderItemsCounts(orderIds),
      this.fetchShippingAddresses(orderIds),
    ]);

    const profilesById = new Map(
      profiles.map((profile) => [
        profile.id,
        profile,
      ]),
    );

    const shippingAddressesByOrderId = new Map(
      shippingAddresses.map((shippingAddress) => [
        shippingAddress.order_id,
        shippingAddress,
      ]),
    );

    console.log('Orders mapping data:', {
      ordersCount: supabaseOrders.length,
      profilesCount: profiles.length,
      shippingAddressesCount:
        shippingAddresses.length,
      shippingOrderIds: [
        ...shippingAddressesByOrderId.keys(),
      ],
    });

    return supabaseOrders.map((order) => {
      const profile = order.user_id
        ? profilesById.get(order.user_id)
        : undefined;

      const shippingAddress =
        shippingAddressesByOrderId.get(order.id);

      console.log('Mapping order customer:', {
        orderId: order.id,
        orderNumber: order.order_number,
        userId: order.user_id,
        profile,
        shippingAddress,
      });

      return this.mapToAdminOrder(
        order,
        profile,
        shippingAddress,
        orderItemsCounts[order.id] ?? 0,
      );
    });
  } catch (error) {
    console.error(
      'Error fetching orders from Supabase:',
      error,
    );

    throw error;
  }
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

  console.log('Admin Supabase session:', {
    userId: user.id,
    email: user.email,
  });
}

  getOrderStats(orders: AdminOrder[]): OrderStats {
    const processing = orders.filter(
      (order) =>
        order.delivery === 'Processing' ||
        order.delivery === 'Pending',
    ).length;

    const delivered = orders.filter(
      (order) => order.delivery === 'Delivered',
    ).length;

    const refunded = orders.filter(
      (order) =>
        order.delivery === 'Returned' ||
        order.payment === 'Refunded',
    ).length;

    return {
      totalOrders: orders.length,
      processing,
      delivered,
      refunded,
    };
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
    console.error(
      'Unable to read customer profiles:',
      error,
    );

    throw error;
  }

  const profiles =
    (data ?? []) as SupabaseProfile[];

  console.log('Customer profiles loaded:', {
    requestedUserIds: userIds,
    returnedCount: profiles.length,
    profiles,
  });

  return profiles;
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
    console.error(
      'Unable to read order shipping addresses:',
      error,
    );

    throw error;
  }

  const addresses =
    (data ?? []) as SupabaseOrderShippingAddress[];

  console.log(
    'Order shipping addresses loaded:',
    {
      requestedOrderIds: orderIds,
      requestedCount: orderIds.length,
      returnedCount: addresses.length,
      addresses,
    },
  );

  if (!addresses.length) {
    console.warn(
      'No shipping addresses were returned. Check the order_shipping_addresses RLS policy for the admin user.',
    );
  }

  return addresses;
}

  private async fetchOrderItemsCounts(
    orderIds: string[],
  ): Promise<Record<string, number>> {
    if (!orderIds.length) {
      return {};
    }

    const { data, error } = await this.supabase
      .from('order_items')
      .select('order_id, quantity')
      .in('order_id', orderIds);

    if (error) {
      throw error;
    }

    const counts: Record<string, number> = {};

    for (const item of (data ?? []) as SupabaseOrderItem[]) {
      counts[item.order_id] =
        (counts[item.order_id] ?? 0) +
        Number(item.quantity ?? 0);
    }

    return counts;
  }

  private mapToAdminOrder(
  order: SupabaseOrder,
  profile: SupabaseProfile | undefined,
  shippingAddress:
    | SupabaseOrderShippingAddress
    | undefined,
  itemCount: number,
): AdminOrder {
  const orderId =
    order.order_number?.trim() ||
    this.getShortOrderId(order.id);

  const checkoutName =
    this.buildCustomerName(
      shippingAddress?.first_name,
      shippingAddress?.last_name,
    );

  const isLoggedInOrder = !!order.user_id;

  const customerName = isLoggedInOrder
    ? profile?.full_name?.trim() ||
      checkoutName ||
      'Registered Customer'
    : checkoutName || 'Guest Customer';

  const customerEmail = isLoggedInOrder
    ? profile?.email?.trim() ||
      shippingAddress?.email?.trim() ||
      ''
    : shippingAddress?.email?.trim() || '';

  const phone = isLoggedInOrder
    ? profile?.phone?.trim() ||
      shippingAddress?.phone?.trim() ||
      order.phone?.trim() ||
      undefined
    : shippingAddress?.phone?.trim() ||
      order.phone?.trim() ||
      undefined;

  return {
    id: orderId,
    orderId,
    supabaseOrderId: order.id,

    customerName,
    customerEmail,
    phone,

    date: this.formatDate(order.created_at),
    createdAt: order.created_at ?? '',

    items: itemCount,

    subtotal: this.formatCurrency(
      order.subtotal,
    ),

    shipping: this.formatCurrency(
      order.shipping,
    ),

    total: this.formatCurrency(order.total),

    payment: this.normalizeStatus(
      order.payment_status,
    ) as AdminOrder['payment'],

    delivery: this.normalizeStatus(
      order.status,
    ) as AdminOrder['delivery'],

    address:
      this.buildAddress(shippingAddress) ||
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
  };
}

  private buildCustomerName(
    firstName: string | null | undefined,
    lastName: string | null | undefined,
  ): string {
    return [firstName, lastName]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value)
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
      .filter((value): value is string => !!value)
      .join(', ');
  }

  private normalizeStatus(
    status: string | null,
  ): string {
    if (!status) {
      return 'Pending';
    }

    const normalized = status.toLowerCase().trim();

    const statusMap: Record<string, string> = {
      pending: 'Pending',
      processing: 'Processing',
      shipped: 'Shipped',
      delivered: 'Delivered',
      returned: 'Returned',
      refunded: 'Refunded',
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
    return `$${Number(amount ?? 0).toFixed(2)}`;
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

    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private getShortOrderId(uuid: string): string {
    return `ORD-${uuid.substring(0, 4).toUpperCase()}`;
  }
}