import { Injectable, inject, signal } from '@angular/core';

import { CUSTOMER_SUPABASE } from '../../../core/tokens';
import { CustomerAuthService } from '../../../core/services/auth';
import {
  CustomerLoyaltyTransaction,
  LoyaltyRedeemableProduct,
  LoyaltyTransactionType,
} from '../models';
import { LoyaltyPointsCalculatorService } from './loyalty-points-calculator.service';

const HISTORY_PAGE_SIZE = 20;
const REDEEMABLE_PRODUCTS_PAGE_SIZE = 12;

interface LoyaltyHistoryRpcRow {
  id?: unknown;
  transaction_type?: unknown;
  points_delta?: unknown;
  note?: unknown;
  created_at?: unknown;
  order_id?: unknown;
  order_item_id?: unknown;
  order_number?: unknown;
  order_status?: unknown;
}

interface RedeemableProductRpcRow {
  product_id?: unknown;
  name?: unknown;
  slug?: unknown;
  image_url?: unknown;
  effective_price?: unknown;
  points_cost?: unknown;
  stock?: unknown;
  category_name?: unknown;
}

interface PendingLoyaltyOrderRow {
  status?: unknown;
  loyalty_points_earned?: unknown;
  loyalty_checkout_processed?: unknown;
}

@Injectable({ providedIn: 'root' })
export class CustomerLoyaltyPointsService {
  private readonly supabase = inject(CUSTOMER_SUPABASE);
  private readonly auth = inject(CustomerAuthService);
  readonly calculator = inject(LoyaltyPointsCalculatorService);

  readonly transactions = signal<CustomerLoyaltyTransaction[]>([]);
  readonly redeemableProducts = signal<LoyaltyRedeemableProduct[]>([]);
  readonly pendingPoints = signal(0);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly loadingMoreProducts = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMoreHistory = signal(false);
  readonly hasMoreRedeemableProducts = signal(false);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.calculator.refresh();
      const [history, products, pendingPoints] = await Promise.all([
        this.fetchHistory(0),
        this.fetchRedeemableProducts(0),
        this.fetchPendingPoints(),
      ]);
      this.transactions.set(history);
      this.redeemableProducts.set(products);
      this.pendingPoints.set(pendingPoints);
      this.hasMoreHistory.set(history.length === HISTORY_PAGE_SIZE);
      this.hasMoreRedeemableProducts.set(
        products.length === REDEEMABLE_PRODUCTS_PAGE_SIZE,
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load loyalty points.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadMoreHistory(): Promise<void> {
    if (this.loadingMore() || !this.hasMoreHistory()) return;

    this.loadingMore.set(true);
    try {
      const next = await this.fetchHistory(this.transactions().length);
      this.transactions.update((current) => [...current, ...next]);
      this.hasMoreHistory.set(next.length === HISTORY_PAGE_SIZE);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load more points history.');
    } finally {
      this.loadingMore.set(false);
    }
  }

  async loadMoreRedeemableProducts(): Promise<void> {
    if (this.loadingMoreProducts() || !this.hasMoreRedeemableProducts()) return;

    this.loadingMoreProducts.set(true);
    try {
      const next = await this.fetchRedeemableProducts(this.redeemableProducts().length);
      this.redeemableProducts.update((current) => [...current, ...next]);
      this.hasMoreRedeemableProducts.set(
        next.length === REDEEMABLE_PRODUCTS_PAGE_SIZE,
      );
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Unable to load more redeemable products.',
      );
    } finally {
      this.loadingMoreProducts.set(false);
    }
  }

  private async fetchHistory(offset: number): Promise<CustomerLoyaltyTransaction[]> {
    const { data, error } = await this.supabase.rpc('get_my_loyalty_points_history', {
      p_limit: HISTORY_PAGE_SIZE,
      p_offset: offset,
    });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []).map((row) => this.mapHistoryRow(row));
  }

  private async fetchRedeemableProducts(offset: number): Promise<LoyaltyRedeemableProduct[]> {
    const { data, error } = await this.supabase.rpc('get_my_redeemable_loyalty_products', {
      p_limit: REDEEMABLE_PRODUCTS_PAGE_SIZE,
      p_offset: offset,
    });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []).map((row) => this.mapProductRow(row));
  }

  private async fetchPendingPoints(): Promise<number> {
    const userId = await this.auth.getCurrentUserId();
    if (!userId) return 0;

    const { data, error } = await this.supabase
      .from('orders')
      .select('status,loyalty_points_earned,loyalty_checkout_processed')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);

    const terminalStatuses = new Set([
      'delivered',
      'completed',
      'cancelled',
      'canceled',
      'refunded',
      'returned',
    ]);

    return (data ?? []).reduce((total, value) => {
      const row = value as PendingLoyaltyOrderRow;
      const status = typeof row.status === 'string' ? row.status.trim().toLowerCase() : 'pending';
      if (terminalStatuses.has(status) || row.loyalty_checkout_processed !== true) return total;
      return total + this.nonNegativeInteger(row.loyalty_points_earned, 'pending points');
    }, 0);
  }

  private mapHistoryRow(value: unknown): CustomerLoyaltyTransaction {
    const row = value as LoyaltyHistoryRpcRow;
    return {
      id: this.requiredString(row.id, 'history ID'),
      transactionType: this.transactionType(row.transaction_type),
      pointsDelta: this.integer(row.points_delta, 'points change'),
      note: this.nullableString(row.note),
      createdAt: this.requiredString(row.created_at, 'history date'),
      orderId: this.nullableString(row.order_id),
      orderItemId: this.nullableString(row.order_item_id),
      orderNumber: this.nullableString(row.order_number),
      orderStatus: this.nullableString(row.order_status),
    };
  }

  private mapProductRow(value: unknown): LoyaltyRedeemableProduct {
    const row = value as RedeemableProductRpcRow;
    return {
      productId: this.requiredString(row.product_id, 'product ID'),
      name: this.requiredString(row.name, 'product name'),
      slug: this.nullableString(row.slug),
      imageUrl: this.nullableString(row.image_url),
      effectivePrice: this.nonNegativeNumber(row.effective_price, 'product price'),
      pointsCost: this.nonNegativeInteger(row.points_cost, 'points cost'),
      stock: this.nonNegativeInteger(row.stock, 'stock'),
      categoryName: this.nullableString(row.category_name),
    };
  }

  private transactionType(value: unknown): LoyaltyTransactionType {
    if (value === 'earn' || value === 'redeem' || value === 'earn_reversal'
      || value === 'redemption_refund' || value === 'adjustment') {
      return value;
    }
    throw new Error('The loyalty history contains an unsupported transaction type.');
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${field}.`);
    return value;
  }

  private nullableString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private integer(value: unknown, field: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new Error(`Invalid ${field}.`);
    return parsed;
  }

  private nonNegativeInteger(value: unknown, field: string): number {
    const parsed = this.integer(value, field);
    if (parsed < 0) throw new Error(`Invalid ${field}.`);
    return parsed;
  }

  private nonNegativeNumber(value: unknown, field: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid ${field}.`);
    return parsed;
  }
}
