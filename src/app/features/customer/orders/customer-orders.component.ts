import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminPaginationComponent, PaginationPageSize } from '../../../shared/ui/admin-pagination';
import { CurrencyPipe } from '@angular/common';
import { CustomerOrderCardComponent } from './customer-order-card/customer-order-card.component';
import { CustomerOrder } from './customer-order.model';
import { CustomerOrdersService } from './customer-orders.service';

@Component({
  selector: 'app-customer-orders',
  standalone: true,
  imports: [
    RouterLink,
    TranslatePipe,
    CurrencyPipe,
    CustomerOrderCardComponent,
    AdminPaginationComponent,
  ],
  templateUrl: './customer-orders.component.html',
  styleUrl: './customer-orders.component.css',
  host: {
    class: 'block min-w-0',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerOrdersComponent implements OnInit {
  private readonly customerOrders = inject(CustomerOrdersService);
  private readonly ordersList = viewChild<ElementRef<HTMLElement>>('ordersList');
  
  readonly pageSize = signal<PaginationPageSize>(5);

  readonly orders = signal<CustomerOrder[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly expandedOrderId = signal<string | null>(null);
  readonly currentPage = signal(1);
  readonly paginatedOrders = computed(() => {
    const items = this.orders();
    const size = this.pageSize();

    if (size === 'all') {
      return items;
    }

    const start = (this.currentPage() - 1) * size;
    return items.slice(start, start + size);
  });

  readonly totalSpent = computed(() =>
    this.orders().reduce(
      (total, order) => total + Number(order.total ?? 0),
      0,
    ),
  );

  ngOnInit(): void {
    void this.loadOrders();
  }

  async loadOrders(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.orders.set(await this.customerOrders.getCustomerOrders());
      this.currentPage.set(1);
    } catch (error) {
      this.orders.set([]);
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Unable to load your orders. Please try again.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  toggleOrder(orderId: string): void {
    this.expandedOrderId.update((currentOrderId) =>
      currentOrderId === orderId ? null : orderId,
    );
  }

  changePage(page: number): void {
    this.currentPage.set(page);
    this.expandedOrderId.set(null);
    queueMicrotask(() => {
      const list = this.ordersList()?.nativeElement;
      list?.focus({ preventScroll: true });
      list?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  setPageSize(size: PaginationPageSize): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }
}
