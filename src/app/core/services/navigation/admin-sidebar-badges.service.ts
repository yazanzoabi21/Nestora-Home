import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../supabase';
import { AdminNavigationBadgeKey } from './admin-navigation.config';

type BadgeState = Partial<Record<AdminNavigationBadgeKey, string | null>>;

interface BadgeCountFilter {
    column: string;
    operator: 'eq' | 'gt' | 'lte';
    value: boolean | number | string;
}

@Injectable({
    providedIn: 'root',
})
export class AdminSidebarBadgesService {
    private readonly supabase = inject(SupabaseService).client;

    readonly badges = signal<BadgeState>({});

    async refreshAll(): Promise<void> {
        await Promise.all([
            this.refreshBadge('products.total'),
            this.refreshBadge('categories.total'),
            this.refreshBadge('inventory.lowStock'),
            this.refreshBadge('inventory.outOfStock'),
            this.refreshBadge('inventory.stockAlerts'),
            this.refreshBadge('discounts.active'),
            this.refreshBadge('promotions.active'),
            this.refreshBadge('promotions.total'),
            this.refreshBadge('reviews.total'),
            this.refreshBadge('reviews.pending'),
            this.refreshBadge('shipping.activeMethods'),
            this.refreshBadge('shipping.disabledMethods'),
            this.refreshBadge('shipping.activeZones'),
            this.refreshBadge('orders.pending'),
            this.refreshBadge('notifications.unread'),
            this.refreshBadge('media.total'),
            this.refreshBadge('customers.total'),
            this.refreshBadge('orders.total'),
        ]);
    }

    async refreshBadge(key: AdminNavigationBadgeKey): Promise<void> {
        const count = await this.loadBadgeCount(key);

        this.badges.update((current) => ({
            ...current,
            [key]: count === null ? null : String(count),
        }));
    }

    getBadge(key?: AdminNavigationBadgeKey): string | null {
        if (!key) {
            return null;
        }

        return this.badges()[key] ?? null;
    }

    private async loadBadgeCount(key: AdminNavigationBadgeKey): Promise<number | null> {
        switch (key) {
            case 'products.total':
                return this.countTable('products');

            case 'categories.total':
                return this.countTable('categories');

            case 'inventory.lowStock':
                return this.countLowStockProducts();

            case 'inventory.outOfStock':
                return this.countOutOfStockProducts();

            case 'inventory.stockAlerts': {
                const [lowStock, outOfStock] = await Promise.all([
                    this.countLowStockProducts(),
                    this.countOutOfStockProducts(),
                ]);

                if (lowStock === null || outOfStock === null) {
                    return null;
                }

                return lowStock + outOfStock;
            }

            case 'discounts.active':
                return this.countTable('discounts', { column: 'is_active', operator: 'eq', value: true });

            case 'promotions.active':
                return this.countTable('promotions', { column: 'is_active', operator: 'eq', value: true });

            case 'promotions.total':
                return this.countTable('promotions');

            case 'reviews.total':
                return this.countTable('reviews');

            case 'reviews.pending':
                return this.countTable('reviews', { column: 'status', operator: 'eq', value: 'pending' });

            case 'shipping.activeMethods':
                return this.countTable('shipping_methods', { column: 'is_active', operator: 'eq', value: true });

            case 'shipping.disabledMethods':
                return this.countTable('shipping_methods', { column: 'is_active', operator: 'eq', value: false });

            case 'shipping.activeZones':
                return this.countTable('delivery_zones', { column: 'is_active', operator: 'eq', value: true });

            case 'orders.pending':
                return this.countTable('orders', { column: 'status', operator: 'eq', value: 'pending' });

            case 'notifications.unread':
                return this.countTable('notifications', { column: 'is_read', operator: 'eq', value: false });

            case 'media.total':
                return this.countTable('media_assets');

            case 'customers.total':
                return this.countTable('customers');
                
            case 'orders.total':
                return this.countTable('orders');

            default:
                return null;
        }
    }

    private countLowStockProducts(): Promise<number | null> {
        return this.countTable('products', [
            { column: 'stock', operator: 'lte', value: 25 },
            { column: 'stock', operator: 'gt', value: 0 },
        ]);
    }

    private countOutOfStockProducts(): Promise<number | null> {
        return this.countTable('products', { column: 'stock', operator: 'eq', value: 0 });
    }

    private async countTable(
        table: string,
        filters: BadgeCountFilter | BadgeCountFilter[] = [],
    ): Promise<number | null> {
        let query = this.supabase
            .from(table)
            .select('id', {
                count: 'exact',
                head: true,
            });

        for (const filter of Array.isArray(filters) ? filters : [filters]) {
            switch (filter.operator) {
                case 'eq':
                    query = query.eq(filter.column, filter.value);
                    break;
                case 'gt':
                    query = query.gt(filter.column, filter.value);
                    break;
                case 'lte':
                    query = query.lte(filter.column, filter.value);
                    break;
            }
        }

        const { count, error } = await query;

        if (error) {

            return null;
        }

        return count ?? 0;
    }
}
