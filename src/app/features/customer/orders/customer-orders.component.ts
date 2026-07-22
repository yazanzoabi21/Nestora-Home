import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CustomerOrderCardComponent } from './customer-order-card/customer-order-card.component';
import { CustomerOrder } from './customer-order.model';
import { CustomerOrdersService } from './customer-orders.service';

@Component({
  selector: 'app-customer-orders',
  standalone: true,
  imports: [RouterLink, TranslatePipe, CustomerOrderCardComponent],
  templateUrl: './customer-orders.component.html',
  styleUrl: './customer-orders.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerOrdersComponent implements OnInit {
  private readonly customerOrders = inject(CustomerOrdersService);
  
  readonly orders = signal<CustomerOrder[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly expandedOrderId = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadOrders();
  }

  async loadOrders(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    console.log('');

    try {
      this.orders.set(await this.customerOrders.getCustomerOrders());
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
}
