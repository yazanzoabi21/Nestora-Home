import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { CustomerOrder } from '../customer-order.model';
import { CustomerOrderItemComponent } from '../customer-order-item/customer-order-item.component';

type OrderStatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const STATUS_TONES: Readonly<Record<string, OrderStatusTone>> = {
  delivered: 'success',
  shipped: 'warning',
  processing: 'info',
  confirmed: 'warning',
  pending: 'warning',
  cancelled: 'danger',
  canceled: 'danger',
  refunded: 'neutral',
  returned: 'neutral',
};

const KNOWN_STATUS_KEYS = new Set([
  'pending',
  'processing',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
  'canceled',
  'refunded',
  'returned',
]);

const KNOWN_PAYMENT_STATUS_KEYS = new Set([
  'unpaid',
  'pending',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
]);

@Component({
  selector: 'app-customer-order-card',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    TitleCasePipe,
    TranslatePipe,
    CustomerOrderItemComponent,
  ],
  templateUrl: './customer-order-card.component.html',
  styleUrl: './customer-order-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerOrderCardComponent {
  readonly order = input.required<CustomerOrder>();
  readonly expanded = input(false);
  readonly toggleRequested = output<void>();

  readonly detailsId = computed(() => `customer-order-details-${this.order().id}`);
  readonly statusTone = computed<OrderStatusTone>(
    () => STATUS_TONES[this.order().status] ?? 'neutral',
  );
  readonly itemCount = computed(() =>
    this.order().items.reduce((count, item) => count + item.quantity, 0),
  );
  readonly deliveryAddress = computed(() =>
    [this.order().address, this.order().city, this.order().country]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(', '),
  );

  requestToggle(): void {
    this.toggleRequested.emit();
  }

  statusTranslationKey(status: string): string | null {
    return KNOWN_STATUS_KEYS.has(status)
      ? `CUSTOMER.ACCOUNT.ORDERS.STATUS.${status.toUpperCase()}`
      : null;
  }

  paymentStatusTranslationKey(status: string): string | null {
    return KNOWN_PAYMENT_STATUS_KEYS.has(status)
      ? `CUSTOMER.ACCOUNT.ORDERS.PAYMENT_STATUS.${status.toUpperCase()}`
      : null;
  }

  readableStatus(status: string): string {
    return status.replaceAll('_', ' ');
  }
}
