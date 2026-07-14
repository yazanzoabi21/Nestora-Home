import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth';
import { SupabaseService } from '../../../core/services';

interface CustomerOrderRow {
  id: string;
  order_number: string | null;
  status: string | null;
  payment_status: string | null;
  total: number | null;
  created_at: string | null;
}

@Component({
  selector: 'app-customer-orders',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="min-h-[70vh] bg-[#f9f8f6] px-4 py-10 text-[#292929] sm:px-8 lg:px-12 lg:py-14">
      <div class="mx-auto max-w-5xl">
        <nav
          class="mb-8 flex items-center gap-3 text-sm font-bold text-[#858585]"
          aria-label="Breadcrumb"
        >
          <a routerLink="/shop" class="hover:text-[#6B7D5E]">Home</a>
          <span>/</span>
          <span class="text-[#252525]">Orders</span>
        </nav>
        <section class="rounded-[28px] bg-white p-6 shadow-[0_16px_45px_rgba(52,47,41,.08)] sm:p-8">
          <h1 class="text-3xl font-black text-[#1f2a1f]">My Orders</h1>
          @if (loading()) {
            <p class="mt-8 rounded-2xl bg-[#f4efe8] p-6 font-bold text-[#8a847c]">
              <i class="pi pi-spin pi-spinner text-[#6B7D5E]"></i>
              <span class="ms-2">Loading orders...</span>
            </p>
          } @else if (orders().length) {
            <div class="mt-8 grid gap-4">
              @for (order of orders(); track order.id) {
                <article
                  class="grid gap-3 rounded-[22px] border border-[#e8dccf] p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div>
                    <h2 class="text-lg font-black text-[#1f2a1f]">
                      {{ order.order_number || shortId(order.id) }}
                    </h2>
                    <p class="mt-1 text-sm font-bold text-[#8a847c]">
                      {{ order.created_at | date: 'mediumDate' }}
                    </p>
                  </div>
                  <div class="flex flex-wrap items-center gap-3 sm:justify-end">
                    <span
                      class="rounded-full bg-[#eef4e8] px-3 py-1 text-xs font-black text-[#6B7D5E]"
                      >{{ order.status || 'processing' }}</span
                    >
                    <span
                      class="rounded-full bg-[#eee5db] px-3 py-1 text-xs font-black text-[#675f55]"
                      >{{ order.payment_status || 'unpaid' }}</span
                    >
                    <strong class="text-lg font-black">{{
                      order.total || 0 | currency: 'USD'
                    }}</strong>
                  </div>
                </article>
              }
            </div>
          } @else {
            <div class="mt-8 rounded-3xl bg-[#f4efe8] p-8 text-center">
              <h2 class="text-xl font-black text-[#1f2a1f]">No orders yet</h2>
              <a
                class="mt-5 inline-flex rounded-[18px] bg-[#6B7D5E] px-6 py-3 font-black text-white"
                routerLink="/shop/products"
                >Start Shopping</a
              >
            </div>
          }
        </section>
      </div>
    </main>
  `,
})
export class CustomerOrdersComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService).client;

  readonly loading = signal(true);
  readonly orders = signal<CustomerOrderRow[]>([]);

  async ngOnInit(): Promise<void> {
    const userId = await this.auth.getCurrentUserId();
    if (!userId) {
      this.loading.set(false);
      return;
    }

    const { data } = await this.supabase
      .from('orders')
      .select('id,order_number,status,payment_status,total,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    this.orders.set((data ?? []) as CustomerOrderRow[]);
    this.loading.set(false);
  }

  shortId(id: string): string {
    return `ORD-${id.slice(0, 6).toUpperCase()}`;
  }
}
