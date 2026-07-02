import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';

import {
  AdminOrder,
  OrderDateFilter,
  OrderDeliveryStatus,
  OrderPaymentStatus,
  OrdersService,
} from '../../../data-access';
import { ToastService } from '../../../core/services';
import { AdminFormFieldComponent } from '../../../shared/ui/admin-form-field';
import { AdminFormModalComponent } from '../../../shared/ui/admin-form-modal';
import {
  AdminTableCellTemplateDirective,
  AdminTableColumn,
  AdminTableComponent,
  AdminTableRow,
} from '../../../shared/ui/admin-table';
import { KpiCardComponent, KpiCardData } from '../../../shared/ui/kpi-card';

interface AdminSelectOption<T extends string = string> {
  label: string;
  value: T;
}

type OrderStatusFilter = 'all' | OrderDeliveryStatus;
type PaymentStatusFilter = 'all' | OrderPaymentStatus;

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [
    AdminFormFieldComponent,
    AdminFormModalComponent,
    AdminTableCellTemplateDirective,
    AdminTableComponent,
    CommonModule,
    KpiCardComponent,
  ],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css',
})
export class OrdersComponent implements OnInit {
  private readonly ordersService = inject(OrdersService);
  private readonly toast = inject(ToastService);

  readonly orders = signal<AdminOrder[]>([]);
  readonly loading = signal(true);
  readonly searchTerm = signal('');
  readonly selectedDelivery = signal<OrderStatusFilter>('all');
  readonly selectedPayment = signal<PaymentStatusFilter>('all');
  readonly selectedDate = signal<OrderDateFilter>('all');
  readonly selectedOrder = signal<AdminOrder | null>(null);

  readonly orderTableColumns: AdminTableColumn[] = [
    { key: 'orderId', label: 'ORDER ID', type: 'text' },
    { key: 'customer', label: 'CUSTOMER', type: 'text' },
    { key: 'date', label: 'DATE', type: 'text' },
    { key: 'items', label: 'ITEMS', type: 'badge' },
    { key: 'total', label: 'TOTAL', type: 'price' },
    { key: 'payment', label: 'PAYMENT', type: 'status' },
    { key: 'delivery', label: 'DELIVERY', type: 'status' },
    { key: 'actions', label: 'ACTION', type: 'actions' },
  ];

  readonly deliveryOptions: AdminSelectOption<OrderStatusFilter>[] = [
    { label: 'All', value: 'all' },
    { label: 'Processing', value: 'Processing' },
    { label: 'Delivered', value: 'Delivered' },
    { label: 'Shipped', value: 'Shipped' },
    { label: 'Returned', value: 'Returned' },
  ];

  readonly paymentOptions: AdminSelectOption<PaymentStatusFilter>[] = [
    { label: 'All', value: 'all' },
    { label: 'Paid', value: 'Paid' },
    { label: 'Pending', value: 'Pending' },
    { label: 'Refunded', value: 'Refunded' },
  ];

  readonly dateOptions: AdminSelectOption<OrderDateFilter>[] = [
    { label: 'All', value: 'all' },
    { label: 'Today', value: 'today' },
    { label: 'This Week', value: 'this_week' },
    { label: 'This Month', value: 'this_month' },
  ];

  readonly stats = computed(() => this.ordersService.getOrderStats(this.orders()));

  readonly kpiCards = computed<KpiCardData[]>(() => {
    const stats = this.stats();

    return [
      {
        title: 'Total Orders',
        value: stats.totalOrders.toString(),
        icon: 'pi pi-shopping-bag',
        iconColor: '#5f6f43',
        iconBg: '#eef4e8',
        showChart: false,
      },
      {
        title: 'Processing',
        value: stats.processing.toString(),
        icon: 'pi pi-clock',
        iconColor: '#d98916',
        iconBg: '#fff6e7',
        showChart: false,
      },
      {
        title: 'Delivered',
        value: stats.delivered.toString(),
        icon: 'pi pi-check-circle',
        iconColor: '#2f9f69',
        iconBg: '#e9f8ef',
        showChart: false,
      },
      {
        title: 'Refunded',
        value: stats.refunded.toString(),
        icon: 'pi pi-replay',
        iconColor: '#3b78d8',
        iconBg: '#edf4ff',
        showChart: false,
      },
    ];
  });

  readonly filteredOrders = computed(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const selectedDelivery = this.selectedDelivery();
    const selectedPayment = this.selectedPayment();
    const selectedDate = this.selectedDate();

    return this.orders().filter((order) => {
      const matchesSearch =
        !searchTerm ||
        order.id.toLowerCase().includes(searchTerm) ||
        order.customerName.toLowerCase().includes(searchTerm) ||
        order.customerEmail.toLowerCase().includes(searchTerm);
      const matchesDelivery = selectedDelivery === 'all' || order.delivery === selectedDelivery;
      const matchesPayment = selectedPayment === 'all' || order.payment === selectedPayment;
      const matchesDate = selectedDate === 'all' || this.matchesDateFilter(order, selectedDate);

      return matchesSearch && matchesDelivery && matchesPayment && matchesDate;
    });
  });

  readonly tableRows = computed<AdminTableRow[]>(() =>
    this.filteredOrders().map((order) => this.toTableRow(order))
  );

  async ngOnInit(): Promise<void> {
    await this.loadOrders();
  }

  async loadOrders(): Promise<void> {
    this.loading.set(true);

    try {
      this.orders.set(await this.ordersService.getOrders());
    } catch (error) {
      this.toast.failed('Orders could not be loaded', this.errorDetail(error, 'Please try again.'));
    } finally {
      this.loading.set(false);
    }
  }

  exportCsv(): void {
    const rows = this.filteredOrders();
    const header = ['Order ID', 'Customer', 'Email', 'Date', 'Items', 'Total', 'Payment', 'Delivery'];
    const csvRows = [
      header,
      ...rows.map((order) => [
        order.id,
        order.customerName,
        order.customerEmail,
        order.date,
        String(order.items),
        order.total,
        order.payment,
        order.delivery,
      ]),
    ];
    const csv = csvRows.map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'orders.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  openOrderDetails(row: AdminOrder | AdminTableRow): void {
    const order = ('raw' in row ? row.raw : row) as AdminOrder | undefined;

    if (!order) {
      return;
    }

    this.selectedOrder.set(order);
  }

  closeOrderDetails(): void {
    this.selectedOrder.set(null);
  }

  paymentBadgeClass(status: OrderPaymentStatus): string {
    switch (status) {
      case 'Pending':
        return 'bg-[#fff6e7] text-[#a66309]';
      case 'Refunded':
        return 'bg-[#edf4ff] text-[#2f66b3]';
      case 'Paid':
      default:
        return 'bg-[#e9f8ef] text-[#117047]';
    }
  }

  deliveryBadgeClass(status: OrderDeliveryStatus): string {
    switch (status) {
      case 'Shipped':
        return 'bg-[#edf4ff] text-[#2f66b3]';
      case 'Processing':
        return 'bg-[#fff6e7] text-[#a66309]';
      case 'Returned':
        return 'bg-[#f5edff] text-[#7546a6]';
      case 'Delivered':
      default:
        return 'bg-[#e9f8ef] text-[#117047]';
    }
  }

  updateSearch(value: unknown): void {
    this.searchTerm.set(String(value ?? ''));
  }

  updateDelivery(value: unknown): void {
    this.selectedDelivery.set((value as OrderStatusFilter) || 'all');
  }

  updatePayment(value: unknown): void {
    this.selectedPayment.set((value as PaymentStatusFilter) || 'all');
  }

  updateDate(value: unknown): void {
    this.selectedDate.set((value as OrderDateFilter) || 'all');
  }

  private toTableRow(order: AdminOrder): AdminTableRow {
    return {
      id: order.id,
      raw: order,
      orderId: order.id,
      customer: {
        title: order.customerName,
        subtitle: order.customerEmail,
      },
      date: order.date,
      items: {
        label: String(order.items),
        className: 'bg-[#f0ebe4] text-[#675f55]',
      },
      total: order.total,
      payment: {
        label: order.payment,
        className: this.paymentBadgeClass(order.payment),
      },
      delivery: {
        label: order.delivery,
        className: this.deliveryBadgeClass(order.delivery),
      },
      actions: null,
    };
  }

  private matchesDateFilter(order: AdminOrder, filter: OrderDateFilter): boolean {
    const date = this.parseOrderDate(order.date);

    if (!date) {
      return true;
    }

    const reference = new Date(2026, 3, 22);
    const startOfDay = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());

    if (filter === 'today') {
      return date.getTime() === startOfDay.getTime();
    }

    if (filter === 'this_week') {
      const startOfWeek = new Date(startOfDay);
      startOfWeek.setDate(startOfDay.getDate() - 6);
      return date >= startOfWeek && date <= startOfDay;
    }

    if (filter === 'this_month') {
      return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
    }

    return true;
  }

  private parseOrderDate(value: string): Date | null {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private csvCell(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private errorDetail(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
