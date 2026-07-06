import { Injectable } from '@angular/core';
import { SupabaseService } from '../../core/services';
import { AdminOrder, OrderStats } from '../models';

interface SupabaseOrder {
  id: string;
  user_id: string;
  order_number: string | null;
  status: string;
  payment_status: string;
  subtotal: number;
  shipping: number;
  total: number;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

interface SupabaseProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface SupabaseOrderItem {
  order_id: string;
  quantity: number;
}

@Injectable({
  providedIn: 'root',
})
export class OrdersService {
  constructor(private supabase: SupabaseService) {}

  async getOrders(): Promise<AdminOrder[]> {
    try {
      // Fetch orders with limited columns
      const { data: orders, error: ordersError } = await this.supabase.client
        .from('orders')
        .select(
          'id, user_id, order_number, status, payment_status, subtotal, shipping, total, address, city, country, phone, notes, created_at'
        );

      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0) return [];

      const supabaseOrders = orders as SupabaseOrder[];
      const userIds = [...new Set(supabaseOrders.map((o) => o.user_id))];

      // Fetch profiles for customers in parallel
      const profilesPromise = this.fetchProfiles(userIds);
      const orderItemsPromise = this.fetchOrderItemsCounts(
        supabaseOrders.map((o) => o.id)
      );

      const [profiles, orderItemsCounts] = await Promise.all([
        profilesPromise,
        orderItemsPromise,
      ]);

      // Map Supabase data to AdminOrder
      return supabaseOrders.map((order) =>
        this.mapToAdminOrder(
          order,
          profiles.find((p) => p.id === order.user_id),
          orderItemsCounts[order.id] || 0
        )
      );
    } catch (error) {
      console.error('Error fetching orders from Supabase:', error);
      return [];
    }
  }

  getOrderStats(orders: AdminOrder[]): OrderStats {
    const processing = orders.filter(
      (order) => order.delivery === 'Processing' || order.delivery === 'Pending'
    ).length;

    const delivered = orders.filter((order) => order.delivery === 'Delivered').length;

    const refunded = orders.filter(
      (order) => order.delivery === 'Returned' || order.payment === 'Refunded'
    ).length;

    return {
      totalOrders: orders.length,
      processing,
      delivered,
      refunded,
    };
  }

  private async fetchProfiles(userIds: string[]): Promise<SupabaseProfile[]> {
    if (userIds.length === 0) return [];

    try {
      const { data, error } = await this.supabase.client
        .from('profiles')
        .select('id, full_name, email, phone')
        .in('id', userIds);

      if (error) {
        console.error('Error fetching profiles:', error);
        return [];
      }

      return (data || []) as SupabaseProfile[];
    } catch (error) {
      console.error('Error fetching profiles:', error);
      return [];
    }
  }

  private async fetchOrderItemsCounts(orderIds: string[]): Promise<Record<string, number>> {
    if (orderIds.length === 0) return {};

    try {
      const { data, error } = await this.supabase.client
        .from('order_items')
        .select('order_id, quantity')
        .in('order_id', orderIds);

      if (error) {
        console.error('Error fetching order items:', error);
        return {};
      }

      const counts: Record<string, number> = {};

      (data || []).forEach((item: SupabaseOrderItem) => {
        counts[item.order_id] = (counts[item.order_id] || 0) + item.quantity;
      });

      return counts;
    } catch (error) {
      console.error('Error fetching order items:', error);
      return {};
    }
  }

  private normalizeStatus(status: string | null): string {
    if (!status) return 'Pending';

    const normalized = status.toLowerCase().trim();

    const statusMap: Record<string, string> = {
      pending: 'Pending',
      processing: 'Processing',
      shipped: 'Shipped',
      delivered: 'Delivered',
      returned: 'Returned',
      refunded: 'Refunded',
      unpaid: 'Pending',
      paid: 'Paid',
    };

    return statusMap[normalized] || status.charAt(0).toUpperCase() + status.slice(1);
  }

  private formatCurrency(amount: number | null | undefined): string {
    if (!amount && amount !== 0) return '£0.00';

    return `£${Number(amount).toFixed(2)}`;
  }

  private formatDate(dateString: string | null): string {
    if (!dateString) return 'N/A';

    try {
      const date = new Date(dateString);

      if (Number.isNaN(date.getTime())) return 'N/A';

      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return 'N/A';
    }
  }

  private mapToAdminOrder(
    order: SupabaseOrder,
    profile: SupabaseProfile | undefined,
    itemCount: number
  ): AdminOrder {
    const orderId =
      order.order_number && order.order_number.trim()
        ? order.order_number
        : this.getShortOrderId(order.id);

    return {
      id: orderId, // For table display
      orderId: orderId,
      supabaseOrderId: order.id,
      customerName: profile?.full_name || 'Guest Customer',
      customerEmail: profile?.email || '',
      date: this.formatDate(order.created_at),
      createdAt: order.created_at,
      items: itemCount,
      total: this.formatCurrency(order.total),
      subtotal: this.formatCurrency(order.subtotal),
      shipping: this.formatCurrency(order.shipping),
      payment: this.normalizeStatus(order.payment_status) as any,
      delivery: this.normalizeStatus(order.status) as any,
      phone: profile?.phone || order.phone || undefined,
      address: order.address || undefined,
      city: order.city || undefined,
      country: order.country || undefined,
      notes: order.notes || undefined,
    };
  }

  private getShortOrderId(uuid: string): string {
    return 'ORD-' + uuid.substring(0, 4).toUpperCase();
  }
}
