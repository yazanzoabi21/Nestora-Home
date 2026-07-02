import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../supabase';
import { AdminNavigationBadgeKey } from './admin-navigation.config';

type BadgeState = Partial<Record<AdminNavigationBadgeKey, string | null>>;

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
            this.refreshBadge('reviews.pending'),
            this.refreshBadge('reviews.total'),
            this.refreshBadge('shipping.activeMethods'),
            this.refreshBadge('shipping.disabledMethods'),
            this.refreshBadge('shipping.activeZones'),
            this.refreshBadge('orders.pending'),
            this.refreshBadge('notifications.unread'),
            this.refreshBadge('media.total'),
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
                return this.countTable('discounts', (query) =>
                    query.eq('is_active', true)
                );

            case 'promotions.active':
                return this.countTable('promotions', (query) =>
                    query.eq('is_active', true)
                );

            case 'promotions.total':
                return this.countTable('promotions');

            case 'reviews.total':
                return this.countTable('reviews');

            case 'reviews.pending':
                return this.countTable('reviews', (query) =>
                    query.eq('status', 'pending')
                );

            case 'shipping.activeMethods':
                return this.countTable('shipping_methods', (query) =>
                    query.eq('is_active', true)
                );

            case 'shipping.disabledMethods':
                return this.countTable('shipping_methods', (query) =>
                    query.eq('is_active', false)
                );

            case 'shipping.activeZones':
                return this.countTable('delivery_zones', (query) =>
                    query.eq('is_active', true)
                );

            case 'orders.pending':
                return this.countTable('orders', (query) =>
                    query.eq('status', 'pending')
                );

            case 'notifications.unread':
                return this.countTable('notifications', (query) =>
                    query.eq('is_read', false)
                );

            case 'media.total':
                return this.countTable('media_assets');

            default:
                return null;
        }
    }

    private countLowStockProducts(): Promise<number | null> {
        return this.countTable('products', (query) =>
            query.lte('stock', 25).gt('stock', 0)
        );
    }

    private countOutOfStockProducts(): Promise<number | null> {
        return this.countTable('products', (query) =>
            query.eq('stock', 0)
        );
    }

    private async countTable(
        table: string,
        applyFilters?: (query: any) => any,
    ): Promise<number | null> {
        let query = this.supabase
            .from(table)
            .select('id', {
                count: 'exact',
                head: true,
            });

        if (applyFilters) {
            query = applyFilters(query);
        }

        const { count, error } = await query;

        if (error) {
            console.error(`Failed to load sidebar badge count for ${table}:`, error);
            return null;
        }

        return count ?? 0;
    }
}
