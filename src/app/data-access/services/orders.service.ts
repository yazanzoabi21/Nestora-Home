import { Injectable } from '@angular/core';

import { AdminOrder, OrderStats } from '../models';

const MOCK_ORDERS: AdminOrder[] = [
  {
    id: 'ORD-8821',
    customerName: 'Sophie Barrett',
    customerEmail: 'sophie@example.com',
    date: '22 Apr 2026',
    items: 3,
    total: '£248.97',
    payment: 'Paid',
    delivery: 'Delivered',
  },
  {
    id: 'ORD-8820',
    customerName: 'Marcus Hunt',
    customerEmail: 'marcus@example.com',
    date: '22 Apr 2026',
    items: 1,
    total: '£89.99',
    payment: 'Paid',
    delivery: 'Shipped',
  },
  {
    id: 'ORD-8819',
    customerName: 'Clara Morel',
    customerEmail: 'clara@example.com',
    date: '21 Apr 2026',
    items: 5,
    total: '£387.45',
    payment: 'Paid',
    delivery: 'Processing',
  },
  {
    id: 'ORD-8818',
    customerName: 'James Thornton',
    customerEmail: 'james@example.com',
    date: '21 Apr 2026',
    items: 2,
    total: '£124.98',
    payment: 'Pending',
    delivery: 'Processing',
  },
  {
    id: 'ORD-8817',
    customerName: 'Anya Patel',
    customerEmail: 'anya@example.com',
    date: '20 Apr 2026',
    items: 4,
    total: '£312.96',
    payment: 'Paid',
    delivery: 'Delivered',
  },
  {
    id: 'ORD-8816',
    customerName: 'Luca Rossi',
    customerEmail: 'luca@example.com',
    date: '20 Apr 2026',
    items: 1,
    total: '£149.99',
    payment: 'Refunded',
    delivery: 'Returned',
  },
];

@Injectable({
  providedIn: 'root',
})
export class OrdersService {
  async getOrders(): Promise<AdminOrder[]> {
    return [...MOCK_ORDERS];
  }

  getOrderStats(orders: AdminOrder[]): OrderStats {
    return {
      totalOrders: 10,
      processing: orders.filter((order) => order.delivery === 'Processing').length,
      delivered: 4,
      refunded: orders.filter((order) => order.payment === 'Refunded').length,
    };
  }
}
