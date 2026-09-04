import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  takeUntilDestroyed,
} from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  Router,
} from '@angular/router';
import {
  TranslatePipe,
  TranslateService,
} from '@ngx-translate/core';

import {
  AdminOrder,
  AdminOrderItem,
  OrderDateFilter,
  OrderDeliveryStatus,
  OrderPaymentStatus,
  OrdersService,
} from '../../../data-access';
import {
  ToastService,
} from '../../../core/services';
import {
  AdminFormFieldComponent,
} from '../../../shared/ui/admin-form-field';
import {
  AdminFormModalComponent,
} from '../../../shared/ui/admin-form-modal';
import {
  AdminTableCellTemplateDirective,
  AdminTableColumn,
  AdminTableComponent,
  AdminTableRow,
} from '../../../shared/ui/admin-table';
import {
  ExportReportComponent,
  ExportReportConfig,
} from '../../../shared/ui/export-report';
import {
  KpiCardComponent,
  KpiCardData,
} from '../../../shared/ui/kpi-card';

interface AdminSelectOption<
  T extends string = string,
> {
  label: string;
  value: T;
}

type OrderStatusFilter =
  | 'all'
  | OrderDeliveryStatus;

type PaymentStatusFilter =
  | 'all'
  | OrderPaymentStatus;

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [
    AdminFormFieldComponent,
    AdminFormModalComponent,
    AdminTableCellTemplateDirective,
    AdminTableComponent,
    CommonModule,
    ExportReportComponent,
    KpiCardComponent,
    TranslatePipe,
  ],
  templateUrl:
    './orders.component.html',
  styleUrl:
    './orders.component.css',
  changeDetection:
    ChangeDetectionStrategy.OnPush,
})
export class OrdersComponent
  implements OnInit {
  private readonly ordersService =
    inject(OrdersService);

  private readonly route =
    inject(ActivatedRoute);

  private readonly router =
    inject(Router);

  private readonly toast =
    inject(ToastService);

  private readonly translate =
    inject(TranslateService);

  private readonly destroyRef =
    inject(DestroyRef);

  readonly orders =
    signal<AdminOrder[]>([]);

  readonly loading =
    signal(true);

  readonly searchTerm =
    signal('');

  readonly selectedDelivery =
    signal<OrderStatusFilter>('all');

  readonly selectedPayment =
    signal<PaymentStatusFilter>('all');

  readonly selectedDate =
    signal<OrderDateFilter>('all');

  readonly selectedOrder =
    signal<AdminOrder | null>(null);

  readonly selectedOrderDelivery =
    signal<OrderDeliveryStatus>(
      'Pending',
    );

  readonly selectedOrderPayment =
    signal<OrderPaymentStatus>(
      'Pending',
    );

  readonly savingOrderStatus =
    signal(false);

  readonly loyaltyConfirmationVisible =
    signal(false);

  readonly orderItemToRemove =
    signal<AdminOrderItem | null>(null);

  readonly removingOrderItem =
    signal(false);

  readonly langVersion =
    signal(0);

  readonly orderTableColumns =
    computed<AdminTableColumn[]>(
      () => {
        this.langVersion();

        return [
          {
            key: 'orderId',
            label: this.t(
              'ORDERS.TABLE.ORDER_ID',
            ),
            type: 'text',
          },
          {
            key: 'customer',
            label: this.t(
              'ORDERS.TABLE.CUSTOMER',
            ),
            type: 'text',
          },
          {
            key: 'date',
            label: this.t(
              'ORDERS.TABLE.DATE',
            ),
            type: 'text',
          },
          {
            key: 'items',
            label: this.t(
              'ORDERS.TABLE.ITEMS',
            ),
            type: 'badge',
          },
          {
            key: 'total',
            label: this.t(
              'ORDERS.TABLE.TOTAL',
            ),
            type: 'price',
          },
          {
            key: 'payment',
            label: this.t(
              'ORDERS.TABLE.PAYMENT',
            ),
            type: 'status',
          },
          {
            key: 'delivery',
            label: this.t(
              'ORDERS.TABLE.DELIVERY',
            ),
            type: 'status',
          },
          {
            key: 'actions',
            label: this.t(
              'ORDERS.TABLE.ACTION',
            ),
            type: 'actions',
          },
        ];
      },
    );

  readonly deliveryOptions =
    computed<
      AdminSelectOption<OrderStatusFilter>[]
    >(() => {
      this.langVersion();

      return [
        {
          label: this.t(
            'ORDERS.FILTERS.ALL_DELIVERIES',
          ),
          value: 'all',
        },
        {
          label:
            this.statusLabel(
              'Processing',
            ),
          value: 'Processing',
        },
        {
          label:
            this.statusLabel(
              'Delivered',
            ),
          value: 'Delivered',
        },
        {
          label:
            this.statusLabel(
              'Completed',
            ),
          value: 'Completed',
        },
        {
          label:
            this.statusLabel(
              'Shipped',
            ),
          value: 'Shipped',
        },
        {
          label:
            this.statusLabel(
              'Returned',
            ),
          value: 'Returned',
        },
        {
          label:
            this.statusLabel(
              'Cancelled',
            ),
          value: 'Cancelled',
        },
        {
          label:
            this.statusLabel(
              'Pending',
            ),
          value: 'Pending',
        },
      ];
    });

  readonly paymentOptions =
    computed<
      AdminSelectOption<PaymentStatusFilter>[]
    >(() => {
      this.langVersion();

      return [
        {
          label: this.t(
            'ORDERS.FILTERS.ALL_PAYMENTS',
          ),
          value: 'all',
        },
        {
          label:
            this.statusLabel('Paid'),
          value: 'Paid',
        },
        {
          label:
            this.statusLabel(
              'Pending',
            ),
          value: 'Pending',
        },
        {
          label:
            this.statusLabel(
              'Refunded',
            ),
          value: 'Refunded',
        },
        {
          label:
            this.statusLabel(
              'Unpaid',
            ),
          value: 'Unpaid',
        },
        {
          label:
            this.statusLabel(
              'Failed',
            ),
          value: 'Failed',
        },
      ];
    });

  readonly dateOptions =
    computed<
      AdminSelectOption<OrderDateFilter>[]
    >(() => {
      this.langVersion();

      return [
        {
          label: this.t(
            'ORDERS.FILTERS.ALL_DATES',
          ),
          value: 'all',
        },
        {
          label: this.t(
            'ORDERS.FILTERS.TODAY',
          ),
          value: 'today',
        },
        {
          label: this.t(
            'ORDERS.FILTERS.THIS_WEEK',
          ),
          value: 'this_week',
        },
        {
          label: this.t(
            'ORDERS.FILTERS.THIS_MONTH',
          ),
          value: 'this_month',
        },
      ];
    });

  readonly stats = computed(() =>
    this.ordersService.getOrderStats(
      this.orders(),
    ),
  );

  readonly loyaltyCreditWarningPoints =
    computed(() => {
      const order =
        this.selectedOrder();

      const nextDeliveryStatus =
        this.selectedOrderDelivery();

      const nextPaymentStatus =
        this.selectedOrderPayment();

      if (
        !order ||
        !order.customerUserId ||
        order.loyaltyPoints <= 0 ||
        order.loyaltyProcessed
      ) {
        return 0;
      }

      if (
        nextDeliveryStatus !==
        'Delivered' &&
        nextDeliveryStatus !==
        'Completed'
      ) {
        return 0;
      }

      if (
        order.delivery ===
        'Delivered' ||
        order.delivery ===
        'Completed'
      ) {
        return 0;
      }

      if (
        order.delivery ===
        'Cancelled' ||
        order.delivery ===
        'Returned' ||
        order.payment ===
        'Refunded' ||
        nextPaymentStatus ===
        'Refunded'
      ) {
        return 0;
      }

      return order.loyaltyPoints;
    });

  readonly ordersExportConfig =
    computed<ExportReportConfig>(
      () => {
        this.langVersion();

        const orders =
          this.filteredOrders();

        return {
          fileName:
            'nestora-orders-report',

          reportTitle: this.t(
            'ORDERS.EXPORT_REPORT_TITLE',
          ),

          reportSubtitle: this.t(
            'ORDERS.EXPORT_SUBTITLE',
            {
              count: orders.length,
            },
          ),

          orientation:
            'landscape',

          summaryItems: [
            {
              label: this.t(
                'ORDERS.KPI.TOTAL_ORDERS',
              ),
              value: orders.length,
            },
            {
              label: this.t(
                'ORDERS.KPI.PROCESSING',
              ),
              value:
                orders.filter(
                  (order) =>
                    order.delivery ===
                    'Processing',
                ).length,
            },
            {
              label: this.t(
                'ORDERS.KPI.DELIVERED',
              ),
              value:
                orders.filter(
                  (order) =>
                    order.delivery ===
                    'Delivered',
                ).length,
            },
            {
              label: this.t(
                'ORDERS.FIELDS.TOTAL',
              ),
              value:
                this.formatCurrency(
                  orders.reduce(
                    (sum, order) =>
                      sum +
                      this.parseCurrency(
                        order.total,
                      ),
                    0,
                  ),
                ),
            },
          ],

          sections: [
            {
              title: this.t(
                'ORDERS.TITLE',
              ),

              headers: [
                this.t(
                  'ORDERS.TABLE.ORDER_ID',
                ),
                this.t(
                  'ORDERS.FIELDS.CUSTOMER_NAME',
                ),
                this.t(
                  'ORDERS.FIELDS.EMAIL',
                ),
                this.t(
                  'ORDERS.FIELDS.PHONE',
                ),
                this.t(
                  'ORDERS.FIELDS.ADDRESS',
                ),
                this.t(
                  'ORDERS.FIELDS.CITY',
                ),
                this.t(
                  'ORDERS.FIELDS.COUNTRY',
                ),
                this.t(
                  'ORDERS.FIELDS.ITEMS',
                ),
                this.t(
                  'ORDERS.FIELDS.SUBTOTAL',
                ),
                this.t(
                  'ORDERS.FIELDS.SHIPPING',
                ),
                this.t(
                  'ORDERS.FIELDS.TOTAL',
                ),
                this.t(
                  'ORDERS.TABLE.PAYMENT',
                ),
                this.t(
                  'ORDERS.TABLE.DELIVERY',
                ),
                this.t(
                  'ORDERS.TABLE.DATE',
                ),
              ],

              excludedPdfColumns: [
                this.t(
                  'ORDERS.FIELDS.PHONE',
                ),
                this.t(
                  'ORDERS.FIELDS.ADDRESS',
                ),
              ],

              truncateColumns: [
                this.t(
                  'ORDERS.FIELDS.CUSTOMER_NAME',
                ),
                this.t(
                  'ORDERS.FIELDS.EMAIL',
                ),
                this.t(
                  'ORDERS.FIELDS.ADDRESS',
                ),
              ],

              rows: orders.map(
                (order) => [
                  order.orderId,
                  order.customerName,
                  order.customerEmail ||
                  '-',
                  order.phone ?? '-',
                  order.address ?? '-',
                  order.city ?? '-',
                  order.country ?? '-',
                  String(order.items),
                  order.subtotal ?? '-',
                  order.shipping ?? '-',
                  order.total,
                  order.payment,
                  order.delivery,
                  order.date,
                ],
              ),
            },
          ],
        };
      },
    );

  readonly kpiCards =
    computed<KpiCardData[]>(
      () => {
        this.langVersion();

        const stats =
          this.stats();

        return [
          {
            title: this.t(
              'ORDERS.KPI.TOTAL_ORDERS',
            ),
            value:
              stats.totalOrders.toString(),
            icon:
              'pi pi-shopping-bag',
            iconColor:
              '#5f6f43',
            iconBg:
              '#eef4e8',
            showChart: false,
          },
          {
            title: this.t(
              'ORDERS.KPI.PROCESSING',
            ),
            value:
              stats.processing.toString(),
            icon: 'pi pi-clock',
            iconColor:
              '#d98916',
            iconBg:
              '#fff6e7',
            showChart: false,
          },
          {
            title: this.t(
              'ORDERS.KPI.DELIVERED',
            ),
            value:
              stats.delivered.toString(),
            icon:
              'pi pi-check-circle',
            iconColor:
              '#2f9f69',
            iconBg:
              '#e9f8ef',
            showChart: false,
          },
          {
            title: this.t(
              'ORDERS.KPI.REFUNDED',
            ),
            value:
              stats.refunded.toString(),
            icon: 'pi pi-replay',
            iconColor:
              '#3b78d8',
            iconBg:
              '#edf4ff',
            showChart: false,
          },
        ];
      },
    );

  readonly filteredOrders =
    computed(() => {
      const searchTerm =
        this.searchTerm()
          .trim()
          .toLowerCase();

      const selectedDelivery =
        this.selectedDelivery();

      const selectedPayment =
        this.selectedPayment();

      const selectedDate =
        this.selectedDate();

      return this.orders().filter(
        (order) => {
          const matchesSearch =
            !searchTerm ||
            order.id
              .toLowerCase()
              .includes(
                searchTerm,
              ) ||
            order.orderId
              .toLowerCase()
              .includes(
                searchTerm,
              ) ||
            order.customerName
              .toLowerCase()
              .includes(
                searchTerm,
              ) ||
            order.customerEmail
              .toLowerCase()
              .includes(
                searchTerm,
              ) ||
            !!order.phone
              ?.toLowerCase()
              .includes(
                searchTerm,
              ) ||
            !!order.city
              ?.toLowerCase()
              .includes(
                searchTerm,
              );

          const matchesDelivery =
            selectedDelivery ===
            'all' ||
            order.delivery ===
            selectedDelivery;

          const matchesPayment =
            selectedPayment ===
            'all' ||
            order.payment ===
            selectedPayment;

          const matchesDate =
            selectedDate ===
            'all' ||
            this.matchesDateFilter(
              order,
              selectedDate,
            );

          return (
            matchesSearch &&
            matchesDelivery &&
            matchesPayment &&
            matchesDate
          );
        },
      );
    });

  readonly tableRows =
    computed<AdminTableRow[]>(
      () => {
        this.langVersion();

        return this
          .filteredOrders()
          .map((order) =>
            this.toTableRow(order),
          );
      },
    );

  readonly filteredOrderTotals =
    computed(() =>
      this.filteredOrders().reduce(
        (totals, order) => ({
          totalWithDelivery:
            totals.totalWithDelivery +
            this.finiteNumber(
              order.totalWithDelivery,
            ),
          totalWithoutDelivery:
            totals.totalWithoutDelivery +
            this.finiteNumber(
              order.totalWithoutDelivery,
            ),
        }),
        {
          totalWithDelivery: 0,
          totalWithoutDelivery: 0,
        },
      ),
    );

  constructor() {
    this.translate.onLangChange
      .pipe(
        takeUntilDestroyed(
          this.destroyRef,
        ),
      )
      .subscribe(() =>
        this.langVersion.update(
          (version) =>
            version + 1,
        ),
      );

    this.route.queryParamMap
      .pipe(
        takeUntilDestroyed(
          this.destroyRef,
        ),
      )
      .subscribe((params) => {
        this.searchTerm.set(
          params.get('q') ?? '',
        );

        const orderId =
          params.get('orderId');

        if (orderId) {
          this.openOrderFromRoute(
            orderId,
          );
        }
      });
  }

  async ngOnInit(): Promise<void> {
    await this.loadOrders();

    this.openOrderFromRoute(
      this.route.snapshot.queryParamMap.get(
        'orderId',
      ),
    );
  }

  async loadOrders(): Promise<void> {
    this.loading.set(true);

    try {
      this.orders.set(
        await this.ordersService.getOrders(),
      );
    } catch (error) {
      this.toast.failed(
        this.t(
          'ORDERS.TOAST.LOAD_FAILED_TITLE',
        ),
        this.errorDetail(
          error,
          this.t(
            'ORDERS.TOAST.LOAD_FAILED_DETAIL',
          ),
        ),
      );
    } finally {
      this.loading.set(false);
    }
  }

  openOrderDetails(
    row: AdminOrder | AdminTableRow,
  ): void {
    const order = (
      'raw' in row
        ? row.raw
        : row
    ) as AdminOrder | undefined;

    if (!order) {
      return;
    }

    this.selectedOrder.set(
      order,
    );

    this.selectedOrderDelivery.set(
      order.delivery,
    );

    this.selectedOrderPayment.set(
      order.payment,
    );
  }

  closeOrderDetails(): void {
    if (
      this.savingOrderStatus() ||
      this.removingOrderItem()
    ) {
      return;
    }

    this.loyaltyConfirmationVisible.set(
      false,
    );

    this.orderItemToRemove.set(null);

    this.selectedOrder.set(
      null,
    );

    this.clearOrderIdQueryParam();
  }

  requestRemoveOrderItem(item: AdminOrderItem): void {
    if (!this.savingOrderStatus() && !this.removingOrderItem()) {
      this.orderItemToRemove.set(item);
    }
  }

  closeRemoveOrderItemConfirmation(): void {
    if (!this.removingOrderItem()) {
      this.orderItemToRemove.set(null);
    }
  }

  async confirmRemoveOrderItem(): Promise<void> {
    const order = this.selectedOrder();
    const item = this.orderItemToRemove();

    if (!order?.supabaseOrderId || !item || this.removingOrderItem()) {
      return;
    }

    this.removingOrderItem.set(true);

    try {
      await this.ordersService.removeOrderItem(order.supabaseOrderId, item.id);

      const refreshedOrders = await this.ordersService.getOrders();
      this.orders.set(refreshedOrders);

      const updatedOrder = refreshedOrders.find(
        (candidate) => candidate.supabaseOrderId === order.supabaseOrderId,
      ) ?? null;

      this.selectedOrder.set(updatedOrder);
      if (updatedOrder) {
        this.selectedOrderDelivery.set(updatedOrder.delivery);
        this.selectedOrderPayment.set(updatedOrder.payment);
      }

      this.orderItemToRemove.set(null);
      this.toast.updated(this.t('ORDERS.TOAST.ITEM_REMOVED_TITLE'));
    } catch (error) {
      this.toast.failed(
        this.t('ORDERS.TOAST.ITEM_REMOVE_FAILED_TITLE'),
        this.errorDetail(error, this.t('ORDERS.TOAST.ITEM_REMOVE_FAILED_DETAIL')),
      );
    } finally {
      this.removingOrderItem.set(false);
    }
  }

  async saveOrderStatus(): Promise<void> {
    if (
      this.loyaltyCreditWarningPoints() >
      0
    ) {
      this.loyaltyConfirmationVisible.set(
        true,
      );

      return;
    }

    await this.persistOrderStatus();
  }

  closeLoyaltyConfirmation(): void {
    if (
      !this.savingOrderStatus()
    ) {
      this.loyaltyConfirmationVisible.set(
        false,
      );
    }
  }

  async confirmOrderStatusSave(): Promise<void> {
    this.loyaltyConfirmationVisible.set(
      false,
    );

    await this.persistOrderStatus();
  }

  paymentBadgeClass(
    status: OrderPaymentStatus,
  ): string {
    switch (status) {
      case 'Pending':
      case 'Unpaid':
      case 'Failed':
        return 'bg-[#fff6e7] text-[#a66309]';

      case 'Refunded':
        return 'bg-[#edf4ff] text-[#2f66b3]';

      case 'Paid':
      default:
        return 'bg-[#e9f8ef] text-[#117047]';
    }
  }

  deliveryBadgeClass(
    status: OrderDeliveryStatus,
  ): string {
    switch (status) {
      case 'Shipped':
        return 'bg-[#edf4ff] text-[#2f66b3]';

      case 'Processing':
      case 'Pending':
        return 'bg-[#fff6e7] text-[#a66309]';

      case 'Returned':
      case 'Cancelled':
        return 'bg-[#f5edff] text-[#7546a6]';

      case 'Completed':
      case 'Delivered':
      default:
        return 'bg-[#e9f8ef] text-[#117047]';
    }
  }

  updateSearch(
    value: unknown,
  ): void {
    this.searchTerm.set(
      String(value ?? ''),
    );
  }

  updateDelivery(
    value: unknown,
  ): void {
    this.selectedDelivery.set(
      (value as OrderStatusFilter) ||
      'all',
    );
  }

  updatePayment(
    value: unknown,
  ): void {
    this.selectedPayment.set(
      (value as PaymentStatusFilter) ||
      'all',
    );
  }

  updateDate(
    value: unknown,
  ): void {
    this.selectedDate.set(
      (value as OrderDateFilter) ||
      'all',
    );
  }

  t(
    key: string,
    params?: Record<
      string,
      unknown
    >,
  ): string {
    return this.translate.instant(
      key,
      params,
    ) as string;
  }

  statusLabel(
    status:
      | OrderPaymentStatus
      | OrderDeliveryStatus,
  ): string {
    return this.t(
      `ORDERS.STATUS.${this.translationKey(
        status,
      )}`,
    );
  }

  translationKey(
    value: string,
  ): string {
    return value
      .trim()
      .replace(
        /[\s-]+/g,
        '_',
      )
      .toUpperCase();
  }

  private async persistOrderStatus(): Promise<void> {
    const order =
      this.selectedOrder();

    if (
      !order?.supabaseOrderId ||
      this.savingOrderStatus()
    ) {
      return;
    }

    this.savingOrderStatus.set(
      true,
    );

    try {
      await this.ordersService.updateOrderStatuses(
        order.supabaseOrderId,
        this.selectedOrderDelivery(),
        this.selectedOrderPayment(),
      );

      this.toast.updated(
        'Order status',
      );

      this.selectedOrder.set(
        null,
      );

      this.clearOrderIdQueryParam();

      await this.loadOrders();
    } catch (error) {
      this.toast.failed(
        'Order status update',
        error instanceof Error
          ? error.message
          : 'Unable to update the order status.',
      );
    } finally {
      this.savingOrderStatus.set(
        false,
      );
    }
  }

  private openOrderFromRoute(
    orderId: string | null,
  ): void {
    if (
      !orderId ||
      !this.orders().length
    ) {
      return;
    }

    const normalized =
      orderId
        .trim()
        .toLowerCase();

    const order =
      this.orders().find(
        (item) =>
          item.supabaseOrderId
            ?.toLowerCase() ===
          normalized ||
          item.id.toLowerCase() ===
          normalized ||
          item.orderId.toLowerCase() ===
          normalized,
      );

    if (!order) {
      return;
    }

    this.openOrderDetails(
      order,
    );
  }

  private clearOrderIdQueryParam(): void {
    if (
      !this.route.snapshot.queryParamMap.has(
        'orderId',
      )
    ) {
      return;
    }

    void this.router.navigate(
      [],
      {
        relativeTo: this.route,

        queryParams: {
          orderId: null,
        },

        queryParamsHandling:
          'merge',

        replaceUrl: true,
      },
    );
  }

  private toTableRow(
    order: AdminOrder,
  ): AdminTableRow {
    return {
      id: order.id,

      raw: order,

      orderId:
        order.orderId,

      customer: {
        title:
          order.customerName,

        subtitle:
          order.customerEmail,
      },

      date: order.date,

      items: {
        label: String(
          order.items,
        ),

        className:
          'bg-[#f0ebe4] text-[#675f55]',
      },

      total: {
        value: order.total,
        withoutDelivery:
          order.totalWithoutDelivery,
      },

      payment: {
        label:
          this.statusLabel(
            order.payment,
          ),

        className:
          this.paymentBadgeClass(
            order.payment,
          ),
      },

      delivery: {
        label:
          this.statusLabel(
            order.delivery,
          ),

        className:
          this.deliveryBadgeClass(
            order.delivery,
          ),
      },

      actions: null,
    };
  }

  private matchesDateFilter(
    order: AdminOrder,
    filter: OrderDateFilter,
  ): boolean {
    if (!order.createdAt) {
      return true;
    }

    const date =
      this.parseOrderDate(
        order.createdAt,
      );

    if (!date) {
      return true;
    }

    const now =
      new Date();

    const startOfDay =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );

    if (
      filter === 'today'
    ) {
      return (
        date.getTime() ===
        startOfDay.getTime()
      );
    }

    if (
      filter ===
      'this_week'
    ) {
      const startOfWeek =
        new Date(startOfDay);

      startOfWeek.setDate(
        startOfDay.getDate() -
        6,
      );

      return (
        date >= startOfWeek &&
        date <= startOfDay
      );
    }

    if (
      filter ===
      'this_month'
    ) {
      return (
        date.getFullYear() ===
        now.getFullYear() &&
        date.getMonth() ===
        now.getMonth()
      );
    }

    return true;
  }

  private finiteNumber(
    value: number | null | undefined,
  ): number {
    const numericValue = Number(
      value ?? 0,
    );

    return Number.isFinite(numericValue)
      ? numericValue
      : 0;
  }

  private parseOrderDate(
    value: string,
  ): Date | null {
    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return null;
    }

    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
  }

  private formatCurrency(
    value: number,
  ): string {
    return `$${Number(
      value ?? 0,
    ).toFixed(2)}`;
  }

  private parseCurrency(
    value: string,
  ): number {
    const match =
      value.match(
        /[\d.]+/,
      );

    return match
      ? parseFloat(match[0])
      : 0;
  }

  private errorDetail(
    error: unknown,
    fallback: string,
  ): string {
    return error instanceof Error
      ? error.message
      : fallback;
  }
}
